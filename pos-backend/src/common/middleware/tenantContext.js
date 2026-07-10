// Sets req.tenantId / req.branchId for downstream handlers. Single-tenant
// deployments (today) get 'default'/'main' by default.
//
// req.user is only populated once requireAuth has run. Since requireAuth is
// mounted per-router (router.use(requireAuth)) rather than globally in
// app.js, this middleware is mounted twice by design:
//   1. Globally in app.js (right after body parsing) — cheap defaults for
//      every request, including unauthenticated ones (health check, login).
//   2. Inside each new module's router, immediately AFTER router.use(requireAuth)
//      — so req.user.tenantId (once tenant-scoped auth exists) can override
//      the default. It's idempotent, so running it twice is harmless.
function tenantContext(req, res, next) {
  req.tenantId = (req.user && req.user.tenantId) || req.tenantId || 'default';
  req.branchId = req.headers['x-branch-id'] || req.branchId || 'main';
  next();
}

module.exports = tenantContext;
