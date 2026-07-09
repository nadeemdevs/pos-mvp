const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./payments.controller');

const router = express.Router();

router.post('/manual', requireAuth, authorize('payments.take'), controller.manual);
router.post('/initiate', requireAuth, authorize('payments.take'), controller.initiate);
router.get('/:id', requireAuth, authorize('payments.take'), controller.getOne);
router.post('/:id/cancel', requireAuth, authorize('payments.take'), controller.cancel);

// Vendor webhooks — no auth. Keep the old path as a trivial alias (provider
// pulled from the request body in that case).
router.post('/callback/:provider', controller.callback);
router.post('/callback', controller.callback);

module.exports = router;
