const jwt = require('jsonwebtoken');
const config = require('../../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      permissions: payload.permissions || [],
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
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
