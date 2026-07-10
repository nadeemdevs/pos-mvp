const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./kots.controller');

const router = express.Router();

router.use(requireAuth);

const kitchenAccess = authorize('kitchen.view', 'orders.take');

router.get('/', kitchenAccess, controller.list);
router.post('/:id/status', kitchenAccess, controller.updateStatus);
router.get('/:id/print', kitchenAccess, controller.print);

module.exports = router;
