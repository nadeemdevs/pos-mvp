const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./users.controller');

const router = express.Router();

router.use(requireAuth, authorize('users.manage'));

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
