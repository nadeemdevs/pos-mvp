const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
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

// Password-reset request is public and email-enumeration-sensitive — keep it
// tight (~5/hr per IP), same style as registerLimiter.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts — please try again later' },
});

// Resend-verification is authenticated but still worth capping per user
// (~3/hr) so it can't be used to spam a mailbox or hammer the email provider.
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id) || ipKeyGenerator(req.ip),
  message: { message: 'Too many verification emails requested — please try again later' },
});

router.post('/login', controller.login);
router.post('/register', registerLimiter, controller.register);
router.get('/me', requireAuth, controller.me);

router.post('/forgot-password', forgotPasswordLimiter, controller.forgotPassword);
router.post('/reset-password', controller.resetPassword);
router.post('/verify-email', controller.verifyEmail);
router.post('/resend-verification', requireAuth, resendVerificationLimiter, controller.resendVerification);
router.post('/change-password', requireAuth, controller.changePassword);

module.exports = router;
