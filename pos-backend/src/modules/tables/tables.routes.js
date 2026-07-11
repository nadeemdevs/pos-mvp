const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./tables.controller');

const router = express.Router();

router.use(requireAuth);

const readAccess = authorize('orders.take', 'tables.manage', 'billing.create');

router.get('/', readAccess, controller.list);
router.post('/', authorize('tables.manage'), controller.create);
router.put('/:id', authorize('tables.manage'), controller.update);
router.delete('/:id', authorize('tables.manage'), controller.remove);
router.post('/:id/transfer', authorize('tables.manage', 'orders.take'), controller.transfer);
router.post('/:id/merge', authorize('tables.manage', 'orders.take'), controller.merge);
router.post('/:id/qr-token', authorize('tables.manage'), controller.generateQrToken);

module.exports = router;
