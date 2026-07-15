// Phase 6.2 — in-memory tenant status cache. Suspension must "bite" on EVERY
// authenticated request (not just fresh logins), but hitting the Tenant
// collection on every request would be wasteful, so statuses are cached
// in-process with a short TTL. The PATCH /api/platform/tenants/:slug endpoint
// calls invalidate() the moment it flips a status, so a suspension takes
// effect immediately for that tenant rather than waiting out the TTL.
//
// Reads the Tenant collection with skipTenantScope because it runs across
// tenants and often outside any request context.
const Tenant = require('./tenant.model');

const cache = new Map(); // tenantId(slug) -> { status, fetchedAt }
const CACHE_TTL_MS = 30 * 1000;

// Returns 'ACTIVE' | 'SUSPENDED'. Unknown tenants (no Tenant row) are treated
// as ACTIVE so the pre-6.1 'default' data and any not-yet-registered tenant
// keep working — suspension is opt-in, never a default-deny.
async function getStatus(tenantId) {
  const slug = tenantId || 'default';
  const now = Date.now();
  const entry = cache.get(slug);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) return entry.status;

  try {
    const tenant = await Tenant.findOne({ slug })
      .select('status')
      .setOptions({ skipTenantScope: true })
      .lean();
    const status = tenant && tenant.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    cache.set(slug, { status, fetchedAt: now });
    return status;
  } catch (err) {
    // DB unreachable — fall back to the last known value, else fail open
    // (ACTIVE) so a transient DB blip can't lock everyone out.
    console.error('[tenantStatus] failed to read tenant status:', err.message);
    return entry ? entry.status : 'ACTIVE';
  }
}

function invalidate(tenantId) {
  cache.delete(tenantId || 'default');
}

// Test/maintenance helper — wipe the whole cache.
function _clear() {
  cache.clear();
}

module.exports = { getStatus, invalidate, _clear, CACHE_TTL_MS };
