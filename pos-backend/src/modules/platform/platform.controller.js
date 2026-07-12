const asyncHandler = require('../../common/utils/asyncHandler');
const Tenant = require('../tenants/tenant.model');
const User = require('../users/user.model');
const Invoice = require('../billing/invoice.model');
const tenantStatus = require('../tenants/tenantStatus');
const auditService = require('../audit/audit.service');
const { disconnectTenant } = require('../../sockets');

// Every query on this surface is CROSS-TENANT, so it MUST opt out of the
// ambient tenant-scoping hooks explicitly via skipTenantScope — we never rely
// on the request context here (the platform admin's own tenantId would
// otherwise leak into these filters/pipelines).

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Platform-wide PAID-invoice revenue in the last 30 days, grouped by tenant.
// Returns a Map slug -> revenue. Single aggregate, skipTenantScope.
async function revenueByTenant30d() {
  const rows = await Invoice.aggregate([
    { $match: { paymentStatus: 'PAID', createdAt: { $gte: daysAgo(30) } } },
    { $group: { _id: '$tenantId', revenue: { $sum: '$total' } } },
  ]).option({ skipTenantScope: true });

  const map = new Map();
  for (const r of rows) map.set(r._id || 'default', round2(r.revenue));
  return map;
}

const overview = asyncHandler(async (req, res) => {
  const [tenantCount, active, suspended, signupsThisMonth, revenueRows] = await Promise.all([
    Tenant.countDocuments({}).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ status: 'ACTIVE' }).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ status: 'SUSPENDED' }).setOptions({ skipTenantScope: true }),
    Tenant.countDocuments({ createdAt: { $gte: startOfMonth() } }).setOptions({ skipTenantScope: true }),
    Invoice.aggregate([
      { $match: { paymentStatus: 'PAID', createdAt: { $gte: daysAgo(30) } } },
      { $group: { _id: null, revenue: { $sum: '$total' } } },
    ]).option({ skipTenantScope: true }),
  ]);

  const revenue30d = revenueRows.length ? round2(revenueRows[0].revenue) : 0;

  res.json({ tenantCount, active, suspended, signupsThisMonth, revenue30d });
});

const listTenants = asyncHandler(async (req, res) => {
  // Pull the tenant registry, then the per-tenant user/invoice counts in two
  // grouped aggregates (skipTenantScope) and join in JS — avoids N+1 queries.
  const [tenants, userCounts, invoiceCounts, revenueMap] = await Promise.all([
    Tenant.find({}).setOptions({ skipTenantScope: true }).sort({ createdAt: -1 }).lean(),
    User.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    Invoice.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 } } }]).option({ skipTenantScope: true }),
    revenueByTenant30d(),
  ]);

  const userMap = new Map(userCounts.map((r) => [r._id || 'default', r.count]));
  const invoiceMap = new Map(invoiceCounts.map((r) => [r._id || 'default', r.count]));

  const result = tenants.map((t) => ({
    slug: t.slug,
    name: t.name,
    ownerEmail: t.ownerEmail,
    status: t.status,
    createdAt: t.createdAt,
    userCount: userMap.get(t.slug) || 0,
    invoiceCount: invoiceMap.get(t.slug) || 0,
    revenue30d: revenueMap.get(t.slug) || 0,
  }));

  res.json(result);
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
      req,
      action: status === 'SUSPENDED' ? 'platform.tenant.suspended' : 'platform.tenant.activated',
      entity: 'Tenant',
      entityId: tenant._id,
      meta: { slug, status },
      // Audit row belongs to the acting platform admin's tenant context is
      // irrelevant here — record it against the affected tenant.
      tenantId: slug,
    });
  }

  res.json({ slug: tenant.slug, name: tenant.name, status: tenant.status, changed });
});

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

module.exports = { overview, listTenants, updateTenantStatus };
