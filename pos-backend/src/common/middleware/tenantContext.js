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

// Phase 6.5 — per-user branch locking. By default a non-privileged staff
// member (anyone without the `branches.manage` permission — reused as the
// bypass gate rather than inventing a new permission) can only ever operate
// against their OWN home branch (User.branchId, carried in the JWT), no
// matter what `x-branch-id` header they send. A tenant Admin/Manager can
// flip `settings.branchAccess.staffCanSwitchBranches` to true to let every
// staff member roam across branches via the header, same as a
// `branches.manage` holder always could.
//
// Mirrors the getActiveBranchCodes cache above (per-tenant Map, short TTL),
// so this doesn't cost a Mongo round trip on every single request.
const branchAccessCache = new Map(); // tenantId -> { allowed:boolean, fetchedAt }
const BRANCH_ACCESS_CACHE_TTL_MS = 30 * 1000;

async function getStaffCanSwitchBranches(tenantId) {
  const now = Date.now();
  const entry = branchAccessCache.get(tenantId);
  if (entry && now - entry.fetchedAt < BRANCH_ACCESS_CACHE_TTL_MS) return entry.allowed;

  try {
    // Required lazily to avoid a require-cycle at module-load time.
    const Setting = require('../../modules/settings/setting.model');
    const setting = await Setting.findOne({ tenantId }).select('branchAccess').lean();
    const allowed = Boolean(setting && setting.branchAccess && setting.branchAccess.staffCanSwitchBranches);
    branchAccessCache.set(tenantId, { allowed, fetchedAt: now });
    return allowed;
  } catch (err) {
    console.error('[tenantContext] failed to refresh branchAccess setting:', err.message);
    return entry ? entry.allowed : false;
  }
}

// Invalidate the cached branchAccess flag for a tenant immediately after the
// setting is changed (see settings.controller.js), so the toggle takes
// effect on the very next request instead of waiting out the TTL.
function invalidateBranchAccess(tenantId) {
  branchAccessCache.delete(tenantId || 'default');
}

// The actual enforcement rule, extracted as a pure function so it's directly
// unit-testable without spinning up Express/Mongo:
//   - a `branches.manage` holder (or the tenant-wide opt-in) always gets
//     whatever the header resolved to (validated against active branch
//     codes elsewhere — see resolveBranchId below);
//   - everyone else is silently pinned to their own home branch — a stale or
//     malicious header is never honored, but it also never produces an
//     error, so an innocent stale-cache client just quietly stays put.
function computeResolvedBranchId({
  isPrivileged,
  tenantAllowsSwitching,
  userHomeBranch,
  headerResolvedBranchId,
  isAllHeader,
}) {
  if (isAllHeader && (isPrivileged || tenantAllowsSwitching)) return 'all';
  if (isPrivileged || tenantAllowsSwitching) return headerResolvedBranchId;
  return userHomeBranch || 'main';
}

// Resolve the effective branchId for a request within a tenant. Exported so
// requireAuth can re-resolve after the real tenant is known.
//
// `user` is optional — omitted for the pre-`requireAuth` global pass (no
// req.user yet, so no enforcement decision can be made; the header is
// resolved at face value exactly as before and gets overwritten once
// requireAuth re-enters with the real user). Once `user` (req.user, carrying
// permissions + branchId from the JWT) is available, the branch-locking rule
// above is applied.
async function resolveBranchId(tenantId, header, user) {
  const codes = await getActiveBranchCodes(tenantId);
  const normalized = header ? String(header).toLowerCase() : '';
  const isAllHeader = normalized === 'all';
  const headerResolvedBranchId = normalized && codes.has(normalized) ? normalized : 'main';

  if (!user) return headerResolvedBranchId;

  const isPrivileged = Array.isArray(user.permissions) && user.permissions.includes('branches.manage');
  const tenantAllowsSwitching = await getStaffCanSwitchBranches(tenantId);
  const userHomeBranch = user.branchId || 'main';

  return computeResolvedBranchId({
    isPrivileged,
    tenantAllowsSwitching,
    userHomeBranch,
    headerResolvedBranchId,
    isAllHeader,
  });
}

// Applies the 'all' sentinel translation: when resolveBranchId() returns the
// literal string 'all', req.branchId stays 'all' (visible to controllers /
// the frontend) but the ALS context gets branchId:null + allBranches:true,
// so the existing tenantPlugin.js scoping-skip hook fires (it already treats
// a falsy context branchId as "don't scope at all"). Any other resolved
// value runs through completely unchanged.
function runWithResolvedBranch(req, resolvedBranchId, next) {
  req.tenantId = req.tenantId || 'default';
  if (resolvedBranchId === 'all') {
    req.branchId = 'all';
    return requestContext.run({ tenantId: req.tenantId, branchId: null, allBranches: true }, next);
  }
  req.branchId = resolvedBranchId;
  return requestContext.run({ tenantId: req.tenantId, branchId: resolvedBranchId }, next);
}

async function tenantContext(req, res, next) {
  req.tenantId = (req.user && req.user.tenantId) || req.tenantId || 'default';
  const resolvedBranchId = await resolveBranchId(req.tenantId, req.headers['x-branch-id'], req.user);
  runWithResolvedBranch(req, resolvedBranchId, () => next());
}

module.exports = tenantContext;
module.exports.resolveBranchId = resolveBranchId;
module.exports.getActiveBranchCodes = getActiveBranchCodes;
module.exports.getStaffCanSwitchBranches = getStaffCanSwitchBranches;
module.exports.invalidateBranchAccess = invalidateBranchAccess;
module.exports.computeResolvedBranchId = computeResolvedBranchId;
module.exports.runWithResolvedBranch = runWithResolvedBranch;
