const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./kots.controller');

const router = express.Router();

router.use(requireAuth);

const kitchenAccess = authorize('kitchen.view', 'orders.take');

router.get('/', kitchenAccess, controller.list);
router.post('/:id/status', kitchenAccess, requireSpecificBranch, controller.updateStatus);
router.get('/:id/print', kitchenAccess, controller.print);

module.exports = router;
