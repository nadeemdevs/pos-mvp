const jwt = require('jsonwebtoken');
const config = require('../../config');
const PlatformOperator = require('../../modules/platform/platformOperator.model');
const { PLATFORM_SCOPE } = require('../../modules/platform/platformAuth.service');

// Phase 6.4a — gate for the cross-tenant /api/platform surface. Replaces
// requirePlatformAdmin (which trusted a `platformAdmin` boolean baked into a
// TENANT user's JWT — a leaked/compromised restaurant admin account could
// carry that flag). Platform operators are now a wholly separate identity
// (see platformOperator.model.js) with their own token scope, so this
// middleware:
//   1. Verifies the JWT with the SAME secret as tenant tokens (simpler than
//      a second secret — the strict scope check below is what actually
//      provides the isolation, not secret separation).
//   2. REQUIRES scope === 'platform-operator'. A normal tenant user's token
//      has no such claim, so it is flatly rejected here — this is the crux
//      of the whole fix.
//   3. Looks the operator up by id and requires it still exists and is
//      active (an operator deactivated mid-session loses access immediately
//      on their next request, not just at their token's natural expiry).
//
// Deliberately does NOT touch requestContext/tenantContext — platform routes
// have no ambient tenant at all.
async function requirePlatformAuth(req, res, next) {
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

  if (payload.scope !== PLATFORM_SCOPE) {
    return res.status(401).json({ message: 'Not a platform operator token' });
  }

  const operator = await PlatformOperator.findById(payload.sub);
  if (!operator || operator.active !== true) {
    return res.status(401).json({ message: 'Platform operator not found or inactive' });
  }

  req.platformOperator = { id: operator._id.toString(), name: operator.name, email: operator.email };
  next();
}

module.exports = requirePlatformAuth;
