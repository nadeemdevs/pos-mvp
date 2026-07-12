const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./purchasing.controller');

const router = express.Router();

router.use(requireAuth, tenantContext, authorize('purchasing.manage'));

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', requireSpecificBranch, controller.create);
router.put('/:id', requireSpecificBranch, controller.update);
router.post('/:id/place', requireSpecificBranch, controller.place);
router.post('/:id/cancel', requireSpecificBranch, controller.cancel);
router.post('/:id/receive', requireSpecificBranch, controller.receive);

module.exports = router;
