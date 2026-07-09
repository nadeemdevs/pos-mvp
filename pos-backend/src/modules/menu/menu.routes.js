const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./menu.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', authorize('menu.manage'), controller.create);
router.put('/:id', authorize('menu.manage'), controller.update);
router.delete('/:id', authorize('menu.manage'), controller.remove);

module.exports = router;
