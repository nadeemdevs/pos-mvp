const asyncHandler = require('../../common/utils/asyncHandler');
const Tenant = require('../tenants/tenant.model');
const User = require('../users/user.model');
const Invoice = require('../billing/invoice.model');
const tenantStatus = require('../tenants/tenantStatus');
const auditService = require('../audit/audit.service');
const { disconnectTenant } = require('../../sockets');
const PlatformSettings = require('./platformSettings.model');
const { refreshEmailConfigCache } = require('../../common/email/emailConfig');
const platformAuthService = require('./platformAuth.service');

// Every query on this surface is CROSS-TENANT, so it MUST opt out of the
// ambient tenant-scoping hooks explicitly via skipTenantScope — we never rely
// on the request context here (there IS no ambient tenant on this surface at
// all now that it's gated by requirePlatformAuth instead of requireAuth).

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

// Phase 6.4a — what's measured here is gross transaction volume flowing
// through tenant restaurants (invoice totals), NOT platform revenue: there is
// no subscription billing yet, so the platform operator earns nothing from
// this number. Field names below are deliberately `gmv*`, not `revenue*`, and
// the frontend labels it "Transaction Volume (GMV)" with an explanatory note
// — see PlatformPage.jsx.
//
// Resolves the ?range=today|7d|30d|all or ?from&to query params into a
// concrete {start, end} Date window. Mirrors the date-range style already
// used by analytics.service.js/reports — explicit from/to (if given) always
// wins over the named `range` shorthand. Defaults to '30d' to keep the
// pre-6.4a default overview/tenants behavior unchanged when no param is sent.
function resolveRange(query) {
  const now = new Date();
  const { range, from, to } = query || {};

  if (from || to) {
    const start = from ? new Date(`${from}T00:00:00`) : new Date(0);
    const end = to ? new Date(`${to}T23:59:59.999`) : now;
    return { start, end, range: 'custom' };
  }

  switch (range) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end, range: 'today' };
    }
    case '7d':
      return { start: daysAgo(6), end: now, range: '7d' };
    case 'all':
      return { start: new Date(0), end: now, range: 'all' };
    case '30d':
    default:
      return { start: daysAgo(30), end: now, range: range || '30d' };
  }
}

// Platform-wide PAID-invoice GMV over [start, end], grouped by tenant.
// Returns a Map slug -> gmv. Single aggregate, skipTenantScope.
async function gmvByTenant(start, end) {
  const rows = await Invoice.aggregate([
    { $match: { paymentStatus: 'PAID', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$tenantId', gmv: { $sum: '$total' } } },
  ]).option({ skipTenantScope: true });

  const map = new Map();
  for (const r of rows) map.set(r._id || 'default', round2(r.gmv));
  return map;
}

// Day-bucketed GMV trend over [start, end] — same shape family as the
// existing peak-hours/daily-sales series ({date, gmv}[]) so the frontend can
// reuse the dependency-free bar-chart CSS pattern from AnalyticsPage.
async function gmvTrend(start, end) {
  const rows = await Invoice.aggregate([
    { $match: { paymentStatus: 'PAID', createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        gmv: { $sum: '$total' },
      },
    },
    { $sort: { _id: 1 } },
  ]).option({ skipTenantScope: true });

  return rows.map((r) => ({ date: r._id, gmv: round2(r.gmv) }));
}

const overview = asyncHandler(async (req, res) => {
  const { start, end, range } = resolveRange(req.query);

  const [tenantCount, active, suspended, signupsThisMonth, gmvRows, trend] = await Promise.all([
    Tenant.countDocuments({}).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ status: 'ACTIVE' }).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ status: 'SUSPENDED' }).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ createdAt: { $gte: startOfMonth() } }).setOptions({ skipTenantScope: true }),
    Invoice.aggregate([
      { $match: { paymentStatus: 'PAID', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, gmv: { $sum: '$total' } } },
    ]).option({ skipTenantScope: true }),
    gmvTrend(start, end),
  ]);

  const gmv = gmvRows.length ? round2(gmvRows[0].gmv) : 0;

  res.json({ tenantCount, active, suspended, signupsThisMonth, range, gmv, gmvTrend: trend });
});

const listTenants = asyncHandler(async (req, res) => {
  const { start, end, range } = resolveRange(req.query);
  const sort = req.query.sort === 'gmv' ? 'gmv' : 'created';

  // Pull the tenant registry, then the per-tenant user/invoice counts in two
  // grouped aggregates (skipTenantScope) and join in JS — avoids N+1 queries.
  const [tenants, userCounts, invoiceCounts, gmvMap] = await Promise.all([
    Tenant.find({}).setOptions({ skipTenantScope: true }).sort({ createdAt: -1 }).lean(),
    User.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    Invoice.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    gmvByTenant(start, end),
  ]);

  const userMap = new Map(userCounts.map((r) => [r._id || 'default', r.count]));
  const invoiceMap = new Map(invoiceCounts.map((r) => [r._id || 'default', r.count]));

  let result = tenants.map((t) => ({
    slug: t.slug,
    name: t.name,
    ownerEmail: t.ownerEmail,
    status: t.status,
    createdAt: t.createdAt,
    userCount: userMap.get(t.slug) || 0,
    invoiceCount: invoiceMap.get(t.slug) || 0,
    gmv: gmvMap.get(t.slug) || 0,
  }));

  // Default stays newest-first (existing behavior/UI expectation);
  // ?sort=gmv turns the table into a GMV leaderboard.
  if (sort === 'gmv') {
    result = [...result].sort((a, b) => b.gmv - a.gmv);
  }

  res.json({ items: result, range, sort });
});

const updateTenantStatus = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { status } = req.body;

  if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
    return res.status(400).json({ message: "status must be 'ACTIVE' or 'SUSPENDED'" });
  }

  if (slug === 'default' && status === 'SUSPENDED') {
    return res.status(400).json({ message: 'The primary tenant cannot be suspended' });
  }

  const tenant = await Tenant.findOne({ slug }).setOptions({ skipTenantScope: true });
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const changed = tenant.status !== status;
  if (changed) {
    tenant.status = status;
    await tenant.save();

    // Invalidate the in-memory status cache so the change bites immediately
    // (both the REST suspension gate and the socket handshake read from it).
    tenantStatus.invalidate(slug);

    if (status === 'SUSPENDED') {
      // Tear down any live realtime connections for this tenant right away.
      disconnectTenant(slug);
    }

    auditService.log({
      action: status === 'SUSPENDED' ? 'platform.tenant.suspended' : 'platform.tenant.activated',
      entity: 'Tenant',
      entityId: tenant._id,
      meta: { slug, status, byPlatformOperator: req.platformOperator?.email },
      // Audit row belongs to the acting platform operator's tenant context is
      // irrelevant here (there is none) — record it against the affected tenant.
      tenantId: slug,
    });
  }

  res.json({ slug: tenant.slug, name: tenant.name, status: tenant.status, changed });
});

// GET /api/platform/auth/me — thin re-export so platform.routes.js can wire
// it alongside the rest without a separate router file.
const me = asyncHandler(async (req, res) => {
  res.json(req.platformOperator);
});

function maskApiKey(apiKey) {
  if (!apiKey) return null;
  const last4 = apiKey.slice(-4);
  return `••••${last4}`;
}

function serializeSettings(doc) {
  const emailProvider = (doc && doc.emailProvider) || {};
  const apiKey = emailProvider.apiKey || '';
  return {
    emailProvider: {
      provider: emailProvider.provider || 'RESEND',
      fromAddress: emailProvider.fromAddress || '',
      hasApiKey: Boolean(apiKey),
      apiKeyPreview: maskApiKey(apiKey),
    },
    defaultTrialDays: doc?.defaultTrialDays ?? 14,
    supportEmail: doc?.supportEmail || '',
    maintenanceMode: doc?.maintenanceMode === true,
  };
}

// GET /api/platform/settings — NEVER returns the raw apiKey.
const getSettings = asyncHandler(async (req, res) => {
  const doc = await PlatformSettings.findOne();
  res.json(serializeSettings(doc));
});

// PUT /api/platform/settings — partial updates. An empty/omitted apiKey
// means "keep the existing key"; a non-empty apiKey replaces it. Upserts the
// singleton on first write.
const updateSettings = asyncHandler(async (req, res) => {
  const { emailProvider, defaultTrialDays, supportEmail, maintenanceMode } = req.body || {};

  let doc = await PlatformSettings.findOne();
  if (!doc) doc = new PlatformSettings();

  if (emailProvider && typeof emailProvider === 'object') {
    if (typeof emailProvider.provider === 'string' && emailProvider.provider) {
      doc.emailProvider.provider = emailProvider.provider;
    }
    if (typeof emailProvider.fromAddress === 'string') {
      doc.emailProvider.fromAddress = emailProvider.fromAddress;
    }
    if (typeof emailProvider.apiKey === 'string' && emailProvider.apiKey.trim() !== '') {
      doc.emailProvider.apiKey = emailProvider.apiKey.trim();
    }
    // blank/omitted apiKey -> deliberately left untouched (keep existing key).
  }

  if (typeof defaultTrialDays === 'number' && Number.isFinite(defaultTrialDays)) {
    doc.defaultTrialDays = defaultTrialDays;
  }
  if (typeof supportEmail === 'string') {
    doc.supportEmail = supportEmail;
  }
  if (typeof maintenanceMode === 'boolean') {
    doc.maintenanceMode = maintenanceMode;
  }

  await doc.save();

  // Pick up the change immediately (email sends already in flight keep using
  // whatever was cached at call time — this just refreshes for the NEXT send).
  await refreshEmailConfigCache();

  // Phase 6.4a — a proper platform-level audit trail (the existing AuditLog
  // model is tenant/branch-scoped via the tenant plugin; forcing it into an
  // unscoped shape here would be a bigger rework than this phase's budget)
  // is a good candidate for a future increment. For now, a clear console
  // line is the whole audit trail for platform settings changes.
  console.log(`[platform] settings updated by ${req.platformOperator?.email || 'unknown operator'}`);

  res.json(serializeSettings(doc));
});

module.exports = {
  overview,
  listTenants,
  updateTenantStatus,
  me,
  getSettings,
  updateSettings,
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }
    const result = await platformAuthService.login(email, password);
    res.json(result);
  }),
};
