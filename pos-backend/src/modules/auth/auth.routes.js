const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../../common/middleware/auth');
const controller = require('./auth.controller');

const router = express.Router();

// Signup is public and creates real tenants — keep it much tighter than the
// general /api/auth limiter (~10 registrations per hour per IP).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts — please try again later' },
});

router.post('/login', controller.login);
router.post('/register', registerLimiter, controller.register);
router.get('/me', requireAuth, controller.me);

module.exports = router;
