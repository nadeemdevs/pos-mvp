const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./reservations.controller');

const router = express.Router();

router.use(requireAuth);

const access = authorize('reservations.manage', 'orders.take');

router.post('/', access, controller.create);
router.get('/', access, controller.list);
router.get('/:id', access, controller.getOne);
router.put('/:id', access, controller.update);
router.post('/:id/seat', access, controller.seat);
router.post('/:id/cancel', access, controller.cancel);
router.post('/:id/no-show', access, controller.noShow);

module.exports = router;
