const express = require('express');
const { requireAuth, authorize } = require('../../common/middleware/auth');
const controller = require('./analytics.controller');

const router = express.Router();

router.use(requireAuth, authorize('analytics.view'));

router.get('/overview', controller.overview);
router.get('/peak-hours', controller.peakHours);
router.get('/items', controller.items);
router.get('/channels', controller.channels);
router.get('/inventory-value', controller.inventoryValue);
router.get('/branches', controller.branches);

module.exports = router;
