const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./payments.controller');

const router = express.Router();

router.post('/manual', requireAuth, authorize('payments.take'), controller.manual);
router.post('/initiate', requireAuth, authorize('payments.take'), controller.initiate);
router.post('/callback', controller.callback);

module.exports = router;
