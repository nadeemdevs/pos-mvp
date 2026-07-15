const express = require('express');
const { requireAuth } = require('../../common/middleware/auth');
const controller = require('./approvals.controller');

const router = express.Router();

router.use(requireAuth);

// Any authenticated user can attempt PIN verification — the PIN itself is
// the gate, not a permission.
router.post('/verify', controller.verify);

module.exports = router;
