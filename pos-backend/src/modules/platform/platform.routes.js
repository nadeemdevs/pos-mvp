const express = require('express');
const rateLimit = require('express-rate-limit');
const requirePlatformAuth = require('../../common/middleware/requirePlatformAuth');
const controller = require('./platform.controller');

const router = express.Router();

// Phase 6.4a — platform-operator login is public (no session yet to attach a
// token to) but sensitive, so it gets its own tight limiter, mirroring
// authLimiter/forgotPasswordLimiter's style in auth.routes.js.
const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts — please try again later' },
});

router.post('/auth/login', platformLoginLimiter, controller.login);
router.get('/auth/me', requirePlatformAuth, controller.me);

// Everything below requires a platform-operator token — a normal tenant
// user's JWT (even one belonging to a restaurant admin) is REJECTED here,
// because it carries no `scope: 'platform-operator'` claim. See
// requirePlatformAuth.js for the mechanics of that isolation.
router.use(requirePlatformAuth);

router.get('/overview', controller.overview);
router.get('/search', controller.search);
router.get('/audit', controller.auditList);
router.get('/health', controller.health);
router.get('/tenants', controller.listTenants);
router.get('/tenants/:slug', controller.getTenantDetail);
router.patch('/tenants/:slug', controller.updateTenantStatus);
router.put('/tenants/:slug/features', controller.updateTenantFeatures);
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);

module.exports = router;
