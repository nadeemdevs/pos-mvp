const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const controller = require('./purchasing.controller');

const router = express.Router();

router.use(requireAuth, tenantContext, authorize('purchasing.manage'));

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.post('/:id/place', controller.place);
router.post('/:id/cancel', controller.cancel);
router.post('/:id/receive', controller.receive);

module.exports = router;
