const mongoose = require('mongoose');
const asyncHandler = require('../../common/utils/asyncHandler');
const Tenant = require('../tenants/tenant.model');
const User = require('../users/user.model');
const Invoice = require('../billing/invoice.model');
const Setting = require('../settings/setting.model');
const Branch = require('../branches/branch.model');
const tenantStatus = require('../tenants/tenantStatus');
const auditService = require('../audit/audit.service');
const platformAuditService = require('./platformAudit.service');
const PlatformAuditLog = require('./platformAuditLog.model');
const { disconnectTenant } = require('../../sockets');
const PlatformSettings = require('./platformSettings.model');
const { refreshEmailConfigCache, getEmailConfig } = require('../../common/email/emailConfig');
const { getLastEmailAttempt } = require('../../common/email/emailService');
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

    // Phase 6.4b — the platform-level counterpart of the tenant-scoped audit
    // row above: this is the "future increment" 6.4a's own comment
    // anticipated (a proper cross-tenant audit trail, not just a console
    // line). Recorded against the ACTING operator, not the affected tenant.
    platformAuditService.log({
      operatorId: req.platformOperator?.id,
      operatorEmail: req.platformOperator?.email,
      action: status === 'SUSPENDED' ? 'tenant.suspended' : 'tenant.activated',
      entity: 'Tenant',
      entityId: tenant._id,
      meta: { slug, status },
    });
  }

  res.json({ slug: tenant.slug, name: tenant.name, status: tenant.status, changed });
});

// GET /api/platform/tenants/:slug — single-tenant detail view for the
// Tenant Detail page. Every read here is explicitly skipTenantScope'd and
// filtered to the ONE tenant by slug/tenantId — never trusts ambient
// context (there is none on this surface anyway).
const getTenantDetail = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const tenant = await Tenant.findOne({ slug }).setOptions({ skipTenantScope: true }).lean();
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  const { start, end } = resolveRange(req.query);

  const [userCount, invoiceCount, gmvRows, trend, users, branches, settings] = await Promise.all([
    User.countDocuments({ tenantId: slug }).setOptions({ skipTenantScope: true }),
    Invoice.countDocuments({ tenantId: slug }).setOptions({ skipTenantScope: true }),
    Invoice.aggregate([
      { $match: { tenantId: slug, paymentStatus: 'PAID', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, gmv: { $sum: '$total' } } },
    ]).option({ skipTenantScope: true }),
    Invoice.aggregate([
      { $match: { tenantId: slug, paymentStatus: 'PAID', createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          gmv: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]).option({ skipTenantScope: true }),
    User.find({ tenantId: slug })
      .setOptions({ skipTenantScope: true })
      .select('name email role')
      // populate() issues its own separate query under the hood that does
      // NOT inherit the parent query's setOptions — it needs its own
      // skipTenantScope, otherwise it's silently scoped to the AMBIENT
      // tenantId ('default', stamped by the global tenantContext middleware
      // for every unauthenticated-by-tenant request including this one) and
      // the Role lookup comes back null for every tenant other than 'default'.
      .populate({ path: 'role', select: 'name', options: { skipTenantScope: true } })
      .lean(),
    Branch.find({ tenantId: slug }).setOptions({ skipTenantScope: true }).select('code name active').lean(),
    Setting.findOne({ tenantId: slug }).setOptions({ skipTenantScope: true }).lean(),
  ]);

  const gmv30d = gmvRows.length ? round2(gmvRows[0].gmv) : 0;
  const gmvTrendSeries = trend.map((r) => ({ date: r._id, gmv: round2(r.gmv) }));

  res.json({
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
      ownerEmail: tenant.ownerEmail,
      status: tenant.status,
      createdAt: tenant.createdAt,
    },
    stats: { userCount, invoiceCount, gmv30d, gmvTrend: gmvTrendSeries },
    // NEVER include passwordHash (or any other secret) — select() above
    // already limits the fields pulled from Mongo, this is a second,
    // defence-in-depth pass that only forwards known-safe fields.
    users: users.map((u) => ({ name: u.name, email: u.email, role: u.role?.name || null })),
    branches: branches.map((b) => ({ code: b.code, name: b.name, active: b.active })),
    features: (settings && settings.features) || {},
  });
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

  // Phase 6.4b — replaces the 6.4a console-log-only note with a real
  // platform-level audit trail entry (see platformAudit.service.js /
  // platformAuditLog.model.js).
  platformAuditService.log({
    operatorId: req.platformOperator?.id,
    operatorEmail: req.platformOperator?.email,
    action: 'platform.settings_updated',
    entity: 'PlatformSettings',
    entityId: doc._id,
  });

  res.json(serializeSettings(doc));
});

// Non-clobbering partial merge for a tenant's Setting.features sub-document —
// mirrors settings.controller.js#mergeFeatures exactly (same key list, same
// "only apply provided keys" contract) so this cross-tenant write path can
// never wipe sibling feature flags, let alone any OTHER settings field.
// Exported as a pure function so it's independently unit-testable.
function mergeFeatures(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.dineIn !== undefined) merged.dineIn = incoming.dineIn;
  if (incoming.inventory !== undefined) merged.inventory = incoming.inventory;
  if (incoming.crm !== undefined) merged.crm = incoming.crm;
  if (incoming.loyalty !== undefined) merged.loyalty = incoming.loyalty;
  if (incoming.analytics !== undefined) merged.analytics = incoming.analytics;
  if (incoming.reservations !== undefined) merged.reservations = incoming.reservations;
  if (incoming.shifts !== undefined) merged.shifts = incoming.shifts;
  if (incoming.onlineOrdering !== undefined) merged.onlineOrdering = incoming.onlineOrdering;

  return merged;
}

// PUT /api/platform/tenants/:slug/features — the ONE sanctioned cross-tenant
// mutation path outside a tenant's own session. Deliberately scoped to
// EXACTLY the `features` key of that tenant's Setting document: resolves the
// doc by tenantId (skipTenantScope, filtered explicitly to this one tenant),
// applies the same non-clobbering partial merge used by the tenant-side
// settings controller, and saves — every other settings field (payment
// secrets, discounts, printing, delivery, ...) is left byte-identical.
const updateTenantFeatures = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { features } = req.body || {};

  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    return res.status(400).json({ message: 'features object is required' });
  }

  const tenant = await Tenant.findOne({ slug }).setOptions({ skipTenantScope: true });
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found' });
  }

  let settings = await Setting.findOne({ tenantId: slug }).setOptions({ skipTenantScope: true });
  if (!settings) {
    settings = new Setting({ tenantId: slug });
  }

  const before = settings.features && settings.features.toObject ? settings.features.toObject() : settings.features || {};
  const merged = mergeFeatures(settings.features, features);
  settings.features = merged;
  await settings.save();

  // Only report keys that actually changed value, not every key touched.
  const changed = {};
  for (const key of Object.keys(features)) {
    if (before[key] !== merged[key]) {
      changed[key] = merged[key];
    }
  }

  platformAuditService.log({
    operatorId: req.platformOperator?.id,
    operatorEmail: req.platformOperator?.email,
    action: 'tenant.features_overridden',
    entity: 'Tenant',
    entityId: tenant._id,
    meta: { slug, changed },
  });

  res.json({ slug, features: merged });
});

// GET /api/platform/audit — mirrors ../audit/audit.controller.js's
// query/pagination shape exactly, against the PLATFORM-level audit
// collection instead of the tenant-scoped one.
const auditList = asyncHandler(async (req, res) => {
  const { action, entity, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (action) filter.action = action;
  if (entity) filter.entity = entity;

  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from);
    if (to) filter.at.$lte = new Date(to);
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    PlatformAuditLog.find(filter)
      .sort({ at: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    PlatformAuditLog.countDocuments(filter),
  ]);

  res.json({ items, total, page: pageNum });
});

// GET /api/platform/health — quick operational snapshot: DB reachability +
// latency, email provider config + last send-attempt outcome, process
// uptime/version.
const health = asyncHandler(async (req, res) => {
  const dbStart = Date.now();
  let dbConnected = false;
  try {
    await mongoose.connection.db.admin().ping();
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
  }
  const pingMs = Date.now() - dbStart;

  const emailConfig = getEmailConfig();

  res.json({
    db: { connected: dbConnected, pingMs },
    email: {
      provider: emailConfig.provider,
      configured: Boolean(emailConfig.apiKey),
      lastAttempt: getLastEmailAttempt(),
    },
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/platform/search?q= — simple regex-based cross-tenant lookup.
// Deliberately capped at 5 results per bucket and case-insensitive-regex
// based (no search index) — this is operator tooling at the current scale,
// not a public-facing search feature.
const search = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.json({ tenants: [], users: [] });
  }

  // Escape regex metacharacters so a literal query like "a+b" or "(test)"
  // doesn't throw / behave unexpectedly.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'i');

  const [tenants, users] = await Promise.all([
    Tenant.find({ $or: [{ name: pattern }, { slug: pattern }, { ownerEmail: pattern }] })
      .setOptions({ skipTenantScope: true })
      .limit(5)
      .select('name slug ownerEmail')
      .lean(),
    User.find({ $or: [{ name: pattern }, { email: pattern }] })
      .setOptions({ skipTenantScope: true })
      .limit(5)
      .select('name email tenantId')
      .lean(),
  ]);

  let usersWithTenant = [];
  if (users.length) {
    const tenantSlugs = [...new Set(users.map((u) => u.tenantId))];
    const tenantDocs = await Tenant.find({ slug: { $in: tenantSlugs } })
      .setOptions({ skipTenantScope: true })
      .select('slug name')
      .lean();
    const tenantNameBySlug = new Map(tenantDocs.map((t) => [t.slug, t.name]));

    usersWithTenant = users.map((u) => ({
      name: u.name,
      email: u.email,
      tenantSlug: u.tenantId,
      tenantName: tenantNameBySlug.get(u.tenantId) || u.tenantId,
    }));
  }

  res.json({
    tenants: tenants.map((t) => ({ name: t.name, slug: t.slug, ownerEmail: t.ownerEmail })),
    users: usersWithTenant,
  });
});

module.exports = {
  overview,
  listTenants,
  updateTenantStatus,
  getTenantDetail,
  updateTenantFeatures,
  mergeFeatures,
  auditList,
  health,
  search,
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
