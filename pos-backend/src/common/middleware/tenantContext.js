const requestContext = require('../requestContext');

// Sets req.tenantId / req.branchId for downstream handlers and wraps the
// rest of the request in an AsyncLocalStorage context (see
// common/requestContext.js) carrying the same values, so the tenant/branch
// scoping query hooks in tenantPlugin.js and the per-tenant counters can
// read the current tenant/branch without a req object.
//
// Phase 6.1: the authoritative tenantId comes from the JWT
// (req.user.tenantId, set by requireAuth). This middleware runs globally
// BEFORE requireAuth, so for authenticated routes it only provides the
// 'default' fallback — requireAuth re-enters requestContext.run with the
// real tenant (and re-resolves the branch within that tenant) once the
// token is verified. The 'default' fallback stays correct for the
// unauthenticated surfaces that don't resolve their own tenant (health
// check, login). The public QR and delivery-webhook routes resolve their
// tenant from the QR token / URL slug instead — see public.routes.js and
// delivery.routes.js.
//
// Branch resolution: the `x-branch-id` header is honored only when it names
// an ACTIVE branch of the CURRENT tenant (case-insensitive match against
// Branch.code) — otherwise it's ignored and the default 'main' applies.
// Active branch codes are cached in-process PER TENANT for ~30s.
const cache = new Map(); // tenantId -> { codes:Set, fetchedAt }
const CACHE_TTL_MS = 30 * 1000;

async function getActiveBranchCodes(tenantId) {
  const now = Date.now();
  const entry = cache.get(tenantId);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) return entry.codes;

  try {
    // Required lazily to avoid a require-cycle at module-load time.
    const Branch = require('../../modules/branches/branch.model');
    // Explicit tenantId in the filter — this runs both with and without an
    // active request context, so don't rely on hook injection.
    const branches = await Branch.find({ active: true, tenantId }).select('code').lean();
    const codes = new Set(branches.map((b) => String(b.code).toLowerCase()));
    cache.set(tenantId, { codes, fetchedAt: now });
    return codes;
  } catch (err) {
    // DB not reachable yet (e.g. very first request during boot) — fall back
    // to whatever we last had cached (possibly empty), never throw here.
    console.error('[tenantContext] failed to refresh active branch codes:', err.message);
    return entry ? entry.codes : new Set();
  }
}

// Resolve the effective branchId for a request within a tenant. Exported so
// requireAuth can re-resolve after the real tenant is known.
async function resolveBranchId(tenantId, header) {
  if (!header) return 'main';

  const codes = await getActiveBranchCodes(tenantId);
  const normalized = String(header).toLowerCase();
  return codes.has(normalized) ? normalized : 'main';
}

async function tenantContext(req, res, next) {
  req.tenantId = (req.user && req.user.tenantId) || req.tenantId || 'default';
  req.branchId = await resolveBranchId(req.tenantId, req.headers['x-branch-id']);

  requestContext.run({ tenantId: req.tenantId, branchId: req.branchId }, () => next());
}

module.exports = tenantContext;
module.exports.resolveBranchId = resolveBranchId;
