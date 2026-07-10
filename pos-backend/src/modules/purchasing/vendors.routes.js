const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const tenantContext = require('../../common/middleware/tenantContext');
const controller = require('./vendors.controller');

const router = express.Router();

router.use(requireAuth, tenantContext);

// Reads also allow inventory.manage (inventory staff may need to look up a
// vendor while adjusting stock/PO context) — writes are purchasing.manage only.
const canRead = authorize('purchasing.manage', 'inventory.manage');
const canWrite = authorize('purchasing.manage');

router.get('/', canRead, controller.list);
router.get('/:id', canRead, controller.getOne);
router.post('/', canWrite, controller.create);
router.put('/:id', canWrite, controller.update);
router.delete('/:id', canWrite, controller.remove);

module.exports = router;
