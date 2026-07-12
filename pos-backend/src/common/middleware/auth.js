const jwt = require('jsonwebtoken');
const config = require('../../config');
const requestContext = require('../requestContext');
const { resolveBranchId } = require('./tenantContext');
const tenantStatus = require('../../modules/tenants/tenantStatus');

// Routes that must stay reachable even when the caller's tenant is suspended:
// the auth endpoints (login does its own suspension check + returns its own
// 403; /me must keep working so a suspended owner can still see who they
// are). /api/platform is listed too for defense-in-depth, though as of Phase
// 6.4a it never runs through requireAuth at all (it's gated entirely by
// requirePlatformAuth against a separate operator identity).
function isSuspensionExempt(req) {
  const url = req.originalUrl || req.url || '';
  return url.startsWith('/api/platform') || url.startsWith('/api/auth');
}

// Phase 6.1: the JWT carries tenantId. The global tenantContext middleware
// runs BEFORE this one (req.user doesn't exist yet there), so it can only
// establish the 'default' fallback context — once the token is verified
// here, we re-enter requestContext.run with the user's REAL tenant (and
// re-resolve the x-branch-id header within that tenant), so every query
// hook downstream scopes to the right tenant. Tokens minted before Phase
// 6.1 have no tenantId claim and fall back to 'default'.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.user = {
    id: payload.id,
    name: payload.name,
    role: payload.role,
    permissions: payload.permissions || [],
    tenantId: payload.tenantId || 'default',
  };

  req.tenantId = req.user.tenantId;

  // Phase 6.2 — suspension gate. Once we know the caller's tenant, refuse the
  // whole authenticated API when that tenant is SUSPENDED, so suspension bites
  // on EXISTING tokens too (not just at login). The exempt routes (see
  // isSuspensionExempt) always pass through. Phase 6.4a: the platform surface
  // no longer runs through requireAuth at all (it's gated by
  // requirePlatformAuth against a wholly separate operator identity), so
  // there is no more "platform admin" concept to exempt here.
  if (!isSuspensionExempt(req)) {
    try {
      const status = await tenantStatus.getStatus(req.tenantId);
      if (status === 'SUSPENDED') {
        return res
          .status(403)
          .json({ code: 'TENANT_SUSPENDED', message: 'This restaurant account is suspended' });
      }
    } catch (err) {
      // getStatus already fails open internally; nothing to do here.
    }
  }

  try {
    req.branchId = await resolveBranchId(req.tenantId, req.headers['x-branch-id']);
  } catch (err) {
    req.branchId = req.branchId || 'main';
  }

  requestContext.run({ tenantId: req.tenantId, branchId: req.branchId }, () => next());
}

function authorize(...permissions) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    if (req.user.role === 'Admin') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = { requireAuth, authorize };
