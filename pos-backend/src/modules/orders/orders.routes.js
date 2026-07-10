const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./orders.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', authorize('orders.take'), controller.create);
router.get('/', authorize('orders.take'), controller.list);
router.get('/:id', authorize('orders.take'), controller.getOne);
router.post('/:id/items', authorize('orders.take'), controller.addItems);
router.put('/:id/items/:itemId', authorize('orders.take'), controller.updateItem);
router.delete('/:id/items/:itemId', authorize('orders.take'), controller.removeItem);
router.post('/:id/kot', authorize('orders.take'), controller.fireKot);
router.post('/:id/request-bill', authorize('orders.take'), controller.requestBill);
router.post('/:id/bill', authorize('billing.create'), controller.bill);
router.post('/:id/cancel', authorize('orders.take'), controller.cancel);

module.exports = router;
