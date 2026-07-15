const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const controller = require('./branches.controller');

const router = express.Router();

router.use(requireAuth, tenantContext);

// Any authenticated user can read the branch list (needed for branch
// switchers in the UI); writes are restricted to branches.manage.
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', authorize('branches.manage'), controller.create);
router.put('/:id', authorize('branches.manage'), controller.update);
router.delete('/:id', authorize('branches.manage'), controller.remove);

module.exports = router;
