const requestContext = require('../requestContext');

// Sets req.tenantId / req.branchId for downstream handlers, and — new in
// Phase 5.3 — wraps the rest of the request in an AsyncLocalStorage context
// (src/common/requestContext.js) carrying the same values, so the branch-
// scoping query hooks in tenantPlugin.js and the per-branch counters can read
// the current branch without a req object.
//
// req.user is only populated once requireAuth has run. Since requireAuth is
// mounted per-router (router.use(requireAuth)) rather than globally, this
// middleware is mounted twice by design:
//   1. Globally in app.js (right after body parsing) — cheap defaults for
//      every request, including unauthenticated ones (health check, login,
//      the public/delivery webhook routes).
//   2. Inside each new module's router, immediately AFTER router.use(requireAuth)
//      — so req.user.tenantId (once tenant-scoped auth exists) can override
//      the default. It's idempotent, so running it twice is harmless (the
//      second call just re-enters als.run with the same values).
//
// Branch resolution: the `x-branch-id` header is honored only when it names
// an ACTIVE branch (case-insensitive match against Branch.code) — otherwise
// it's ignored and the default 'main' applies. Active branch codes are
// cached in-process for ~30s (see getActiveBranchCodes) so this doesn't cost
// a DB round-trip on every request.
let cache = { codes: new Set(), fetchedAt: 0 };
const CACHE_TTL_MS = 30 * 1000;

async function getActiveBranchCodes() {
  const now = Date.now();
  if (now - cache.fetchedAt < CACHE_TTL_MS) return cache.codes;

  try {
    // Required lazily to avoid a require-cycle at module-load time (branch.model
    // pulls in the tenant plugin chain the same as every other model).
    const Branch = require('../../modules/branches/branch.model');
    const branches = await Branch.find({ active: true }).select('code').lean();
    cache = { codes: new Set(branches.map((b) => String(b.code).toLowerCase())), fetchedAt: now };
  } catch (err) {
    // DB not reachable yet (e.g. very first request during boot) — fall back
    // to whatever we last had cached (possibly empty), never throw here.
    console.error('[tenantContext] failed to refresh active branch codes:', err.message);
  }

  return cache.codes;
}

async function resolveBranchId(req) {
  if (req.branchId && req.branchId !== 'main') return req.branchId; // already resolved (second mount)

  const header = req.headers['x-branch-id'];
  if (!header) return 'main';

  const codes = await getActiveBranchCodes();
  const normalized = String(header).toLowerCase();
  return codes.has(normalized) ? normalized : 'main';
}

async function tenantContext(req, res, next) {
  req.tenantId = (req.user && req.user.tenantId) || req.tenantId || 'default';
  req.branchId = await resolveBranchId(req);

  requestContext.run({ tenantId: req.tenantId, branchId: req.branchId }, () => next());
}

module.exports = tenantContext;
