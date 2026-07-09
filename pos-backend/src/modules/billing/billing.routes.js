const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./billing.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', authorize('billing.create'), controller.create);
router.get('/', authorize('billing.view'), controller.list);
router.get('/:id', authorize('billing.view'), controller.getOne);
router.put('/:id', authorize('billing.create'), controller.update);

module.exports = router;
