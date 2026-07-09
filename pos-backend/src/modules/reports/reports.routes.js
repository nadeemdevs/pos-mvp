const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./reports.controller');

const router = express.Router();

router.use(requireAuth, authorize('reports.view'));

router.get('/daily', controller.daily);
router.get('/items', controller.items);
router.get('/payments', controller.payments);

module.exports = router;
