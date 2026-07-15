const express = require('express');
const { requireAuth } = require('../../common/middleware/auth');
const controller = require('./printing.controller');

const router = express.Router();

router.use(requireAuth);
router.post('/test', controller.test);

module.exports = router;
