const express = require('express');
const { requireAuth } = require('../../common/middleware/auth');
const requirePlatformAdmin = require('../../common/middleware/requirePlatformAdmin');
const controller = require('./platform.controller');

const router = express.Router();

// Cross-tenant platform-operator surface. Every route is auth'd AND gated to
// platform admins. requireAuth exempts /api/platform from the tenant
// suspension check, and platform admins are exempt regardless — so an operator
// can still run these while their own tenant (or any tenant) is suspended.
router.use(requireAuth, requirePlatformAdmin);

router.get('/overview', controller.overview);
router.get('/tenants', controller.listTenants);
router.patch('/tenants/:slug', controller.updateTenantStatus);

module.exports = router;
