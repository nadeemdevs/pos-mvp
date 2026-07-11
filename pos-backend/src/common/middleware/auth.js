const jwt = require('jsonwebtoken');
const config = require('../../config');
const requestContext = require('../requestContext');
const { resolveBranchId } = require('./tenantContext');

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
