const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./settings.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.getSettings);
router.put('/', authorize('settings.manage'), controller.updateSettings);

module.exports = router;
