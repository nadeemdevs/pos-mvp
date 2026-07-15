const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./orders.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', authorize('orders.take'), requireSpecificBranch, controller.create);
router.get('/', authorize('orders.take'), controller.list);
router.get('/:id', authorize('orders.take'), controller.getOne);
router.post('/:id/items', authorize('orders.take'), requireSpecificBranch, controller.addItems);
router.put('/:id/items/:itemId', authorize('orders.take'), requireSpecificBranch, controller.updateItem);
router.delete('/:id/items/:itemId', authorize('orders.take'), requireSpecificBranch, controller.removeItem);
router.post('/:id/kot', authorize('orders.take'), requireSpecificBranch, controller.fireKot);
router.post('/:id/request-bill', authorize('orders.take'), requireSpecificBranch, controller.requestBill);
router.post('/:id/bill', authorize('billing.create'), requireSpecificBranch, controller.bill);
router.post('/:id/cancel', authorize('orders.take'), requireSpecificBranch, controller.cancel);

module.exports = router;
