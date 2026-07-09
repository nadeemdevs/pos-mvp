const express = require('express');
const { requireAuth } = require('../../common/middleware/auth');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.get('/me', requireAuth, controller.me);

module.exports = router;
