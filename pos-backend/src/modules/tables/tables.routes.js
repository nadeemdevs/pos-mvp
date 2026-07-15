const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./tables.controller');

const router = express.Router();

router.use(requireAuth);

const readAccess = authorize('orders.take', 'tables.manage', 'billing.create');

router.get('/', readAccess, controller.list);
router.post('/', authorize('tables.manage'), requireSpecificBranch, controller.create);
router.put('/:id', authorize('tables.manage'), requireSpecificBranch, controller.update);
router.delete('/:id', authorize('tables.manage'), requireSpecificBranch, controller.remove);
router.post('/:id/transfer', authorize('tables.manage', 'orders.take'), requireSpecificBranch, controller.transfer);
router.post('/:id/merge', authorize('tables.manage', 'orders.take'), requireSpecificBranch, controller.merge);
router.post('/:id/qr-token', authorize('tables.manage'), requireSpecificBranch, controller.generateQrToken);

module.exports = router;
