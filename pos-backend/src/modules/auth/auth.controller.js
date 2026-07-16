const asyncHandler = require('../../common/utils/asyncHandler');
const authService = require('./auth.service');
const auditService = require('../audit/audit.service');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const result = await authService.login(email, password);

  auditService.log({
    req,
    user: result.user,
    action: 'auth.login',
    entity: 'User',
    entityId: result.user.id,
    meta: { email },
    tenantId: result.user.tenantId,
  });

  res.json(result);
});

// PUBLIC tenant signup (rate-limited in auth.routes.js). Responds exactly
// like login ({token, user}) so the client auto-logs-in.
const register = asyncHandler(async (req, res) => {
  const { restaurantName, ownerName, email, password } = req.body;

  const { tenant, token, user } = await authService.register({ restaurantName, ownerName, email, password });

  auditService.log({
    user,
    action: 'tenant.registered',
    entity: 'Tenant',
    entityId: tenant._id,
    meta: { slug: tenant.slug, name: tenant.name, ownerEmail: tenant.ownerEmail },
    tenantId: tenant.slug,
  });

  res.status(201).json({ token, user });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  res.json(user);
});

const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message: "If an account exists for that email, we've sent a reset link.",
};

// PUBLIC. Deliberately does NOT audit-log — logging attempts would itself be
// an enumeration side-channel. ALWAYS responds 200 with an identical body
// regardless of whether the email exists.
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.forgotPassword(email);
  res.status(200).json(GENERIC_FORGOT_PASSWORD_RESPONSE);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token) return res.status(400).json({ message: 'token is required' });

  const user = await authService.resetPassword(token, newPassword);

  auditService.log({
    user: { id: user._id, name: user.name },
    action: 'auth.password_reset',
    entity: 'User',
    entityId: user._id,
    tenantId: user.tenantId,
  });

  res.json({ message: 'Password has been reset. You can now log in with your new password.' });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'token is required' });

  const user = await authService.verifyEmail(token);

  auditService.log({
    user: { id: user._id, name: user.name },
    action: 'auth.email_verified',
    entity: 'User',
    entityId: user._id,
    tenantId: user.tenantId,
  });

  res.json({ message: 'Email verified' });
});

const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user.id);
  res.json({ message: 'Verification email sent' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await authService.changePassword(req.user.id, currentPassword, newPassword);

  auditService.log({
    req,
    action: 'auth.password_changed',
    entity: 'User',
    entityId: user._id,
  });

  res.json({ message: 'Password changed' });
});

module.exports = {
  login,
  register,
  me,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
};
