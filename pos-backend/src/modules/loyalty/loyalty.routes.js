const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./loyalty.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/redeem', authorize('billing.create'), controller.redeem);
router.post('/adjust', authorize('loyalty.manage'), controller.adjust);
router.get('/summary/:customerId', authorize('billing.create', 'loyalty.manage'), controller.summary);
router.get('/transactions/:customerId', authorize('billing.create', 'loyalty.manage'), controller.transactions);

module.exports = router;
