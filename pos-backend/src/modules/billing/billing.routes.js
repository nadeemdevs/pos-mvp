const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const requireSpecificBranch = require('../../common/middleware/requireSpecificBranch');
const controller = require('./billing.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', authorize('billing.create'), requireSpecificBranch, controller.create);
router.get('/', authorize('billing.view'), controller.list);
router.get('/:id', authorize('billing.view'), controller.getOne);
router.put('/:id', authorize('billing.create'), requireSpecificBranch, controller.update);

module.exports = router;
