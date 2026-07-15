const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./shifts.controller');

const router = express.Router();

router.use(requireAuth);
router.use(tenantContext);

router.post('/open', authorize('shifts.manage'), requireSpecificBranch, controller.open);
router.get('/current', authorize('shifts.manage'), controller.current);
router.get('/', authorize('shifts.manage'), controller.list);
router.get('/:id', authorize('shifts.manage'), controller.getOne);
router.post('/:id/movement', authorize('shifts.manage'), requireSpecificBranch, controller.movement);
router.post('/:id/close', authorize('shifts.manage'), requireSpecificBranch, controller.close);

module.exports = router;
