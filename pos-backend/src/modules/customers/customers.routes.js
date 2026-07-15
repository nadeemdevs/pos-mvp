const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./customers.controller');

const router = express.Router();

router.use(requireAuth);

// Cashiers need to look up + create customers mid-sale, so list/read/create
// accept either permission; update/delete are restricted to customers.manage.
router.get('/', authorize('billing.create', 'customers.manage'), controller.list);
router.get('/:id', authorize('billing.create', 'customers.manage'), controller.getOne);
router.get('/:id/invoices', authorize('billing.create', 'customers.manage'), controller.getInvoices);
router.post('/', authorize('billing.create', 'customers.manage'), controller.create);
router.put('/:id', authorize('customers.manage'), controller.update);
router.delete('/:id', authorize('customers.manage'), controller.remove);

module.exports = router;
