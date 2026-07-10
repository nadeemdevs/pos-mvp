const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const controller = require('./inventory.controller');

const router = express.Router();

router.use(requireAuth, tenantContext);

const canRead = authorize('inventory.manage', 'purchasing.manage');
const canWrite = authorize('inventory.manage');

// Static/action routes before the generic '/:id' so they aren't captured.
router.get('/low', canRead, controller.low);
router.get('/', canRead, controller.list);
router.get('/:id', canRead, controller.getOne);
router.get('/:id/ledger', canRead, controller.ledger);
router.post('/', canWrite, controller.create);
router.post('/:id/adjust', canWrite, controller.adjust);
router.put('/:id', canWrite, controller.update);
router.delete('/:id', canWrite, controller.remove);

module.exports = router;
