// Phase 6.2 — gate for the cross-tenant /api/platform surface. Must run AFTER
// requireAuth (which populates req.user, including the platformAdmin flag it
// reads from the JWT). A normal tenant admin gets a flat 403.
function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }
  if (req.user.platformAdmin !== true) {
    return res.status(403).json({ message: 'Platform administrator access required' });
  }
  next();
}

module.exports = requirePlatformAdmin;
