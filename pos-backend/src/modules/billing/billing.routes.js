const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./billing.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/', authorize('billing.create'), controller.create);
router.get('/', authorize('billing.view'), controller.list);
router.get('/:id', authorize('billing.view'), controller.getOne);
router.put('/:id', authorize('billing.create'), controller.update);
// Fine-grained authorization (billing.refund permission or a manager-PIN
// approval token) happens inside the controller — same precedent as the
// max-discount override on create/update above.
router.post('/:id/refund', authorize('billing.create'), controller.refund);
router.post('/:id/settle', authorize('billing.create'), controller.settle);

module.exports = router;
