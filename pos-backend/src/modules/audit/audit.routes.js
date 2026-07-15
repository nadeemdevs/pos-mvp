const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./audit.controller');

const router = express.Router();

router.use(requireAuth);

// Only Admin has 'audit.view' in the seed (Manager does not), so in practice
// this is Admin-only — Admin also always bypasses the permission check.
router.get('/', authorize('audit.view'), controller.list);

module.exports = router;
