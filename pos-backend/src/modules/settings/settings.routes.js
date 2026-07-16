const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const upload = require('../../common/middleware/upload');
const controller = require('./settings.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.getSettings);
router.get('/export', authorize('settings.manage'), controller.exportTenantData);
router.put('/', authorize('settings.manage'), controller.updateSettings);
router.put('/logo', authorize('settings.manage'), upload.single('logo'), controller.uploadLogo);
// authorize('Admin') relies on requireAuth's Admin-role bypass — no non-admin
// role has a literal 'Admin' permission string, so this is effectively
// Admin-only, matching the phase-5.2 spec.
router.put('/approvals/pin', authorize('Admin'), controller.setApprovalPin);

module.exports = router;
