const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const controller = require('./shifts.controller');

const router = express.Router();

router.use(requireAuth);
router.use(tenantContext);

router.post('/open', authorize('shifts.manage'), controller.open);
router.get('/current', authorize('shifts.manage'), controller.current);
router.get('/', authorize('shifts.manage'), controller.list);
router.get('/:id', authorize('shifts.manage'), controller.getOne);
router.post('/:id/movement', authorize('shifts.manage'), controller.movement);
router.post('/:id/close', authorize('shifts.manage'), controller.close);

module.exports = router;
