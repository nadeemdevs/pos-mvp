const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./reservations.controller');

const router = express.Router();

router.use(requireAuth);

const access = authorize('reservations.manage', 'orders.take');

router.post('/', access, requireSpecificBranch, controller.create);
router.get('/', access, controller.list);
router.get('/:id', access, controller.getOne);
router.put('/:id', access, requireSpecificBranch, controller.update);
router.post('/:id/seat', access, requireSpecificBranch, controller.seat);
router.post('/:id/cancel', access, requireSpecificBranch, controller.cancel);
router.post('/:id/no-show', access, requireSpecificBranch, controller.noShow);

module.exports = router;
