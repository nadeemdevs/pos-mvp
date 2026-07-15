const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const User = require('../users/user.model');
const Role = require('../roles/role.model');
const Tenant = require('../tenants/tenant.model');
const { generateUniqueSlug } = require('../tenants/slug');
const { provisionTenant } = require('../../common/database/provisionTenant');
const { getEmailConfig } = require('../../common/email/emailConfig');
const emailService = require('../../common/email/emailService');
const { isResetTokenInvalidated, isVerifyTokenStale } = require('./auth.tokenInvalidation');
const PlatformSettings = require('../platform/platformSettings.model');

const RESET_SCOPE = 'password-reset';
const VERIFY_SCOPE = 'email-verify';

// Phase 6.4a — maintenance-mode gate. Blocks tenant login/register with a 503
// when the platform operator has flipped PlatformSettings.maintenanceMode on;
// platform operators themselves are entirely unaffected (they never call
// through here — see platformAuth.service.js). Fails OPEN on unexpected DB
// errors so a Mongo hiccup can't itself become an outage.
async function assertNotInMaintenance() {
  let doc;
  try {
    doc = await PlatformSettings.findOne().lean();
  } catch (err) {
    return;
  }
  if (doc && doc.maintenanceMode === true) {
    const err = new Error('The platform is undergoing maintenance — please try again shortly');
    err.status = 503;
    throw err;
  }
}

function issueToken(user, roleName, permissions) {
  return jwt.sign(
    {
      id: user._id.toString(),
      name: user.name,
      role: roleName,
      permissions,
      tenantId: user.tenantId || 'default',
      // Phase 6.5 — the user's HOME branch, so branch-lock decisions in
      // tenantContext.js don't need a DB hit on every request.
      branchId: user.branchId || 'main',
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function userResponse(user, roleName, permissions) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: roleName,
    permissions,
    tenantId: user.tenantId || 'default',
    branchId: user.branchId || 'main',
    emailVerified: user.emailVerified === true,
  };
}

function sendVerificationEmailBestEffort(user) {
  const { frontendUrl } = getEmailConfig();
  const token = jwt.sign({ sub: user._id.toString(), email: user.email, scope: VERIFY_SCOPE }, config.jwtSecret, {
    expiresIn: '24h',
  });
  const verifyLink = `${frontendUrl}/verify-email?token=${token}`;
  // Fire-and-forget — emailService itself never throws, this is just extra
  // insulation so a caller awaiting this can't be broken by a future change.
  return emailService.sendVerificationEmail(user.email, verifyLink).catch(() => {});
}

async function login(email, password) {
  // skipTenantScope: login runs BEFORE any tenant is known (the ambient
  // context is the 'default' fallback) and email is unique GLOBALLY, so the
  // user must be found across all tenants.
  await assertNotInMaintenance();

  const user = await User.findOne({ email: (email || '').toLowerCase(), active: true }).setOptions({
    skipTenantScope: true,
  });

  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  // Tenant status gate — a suspended restaurant can't log in at all.
  const tenant = await Tenant.findOne({ slug: user.tenantId || 'default' });
  if (tenant && tenant.status === 'SUSPENDED') {
    const err = new Error('This restaurant account is suspended');
    err.status = 403;
    throw err;
  }

  // The role lives in the user's tenant, not the ambient 'default' context.
  const role = user.role ? await Role.findById(user.role).setOptions({ skipTenantScope: true }) : null;
  const roleName = role ? role.name : null;
  const permissions = role ? role.permissions : [];

  return {
    token: issueToken(user, roleName, permissions),
    user: userResponse(user, roleName, permissions),
  };
}

// POST /api/auth/register — public tenant signup. Creates the Tenant record,
// provisions its baseline docs (roles/settings/branch/owner) and returns the
// same {token, user} shape as login so the client auto-logs-in.
async function register({ restaurantName, ownerName, email, password }) {
  const badRequest = (message) => {
    const err = new Error(message);
    err.status = 400;
    return err;
  };

  await assertNotInMaintenance();

  if (!restaurantName || !String(restaurantName).trim()) throw badRequest('restaurantName is required');
  if (!ownerName || !String(ownerName).trim()) throw badRequest('ownerName is required');
  if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) throw badRequest('A valid email is required');
  if (!password || String(password).length < 8) throw badRequest('password must be at least 8 characters');

  const normalizedEmail = String(email).toLowerCase().trim();

  // Email is unique globally across ALL tenants.
  const existing = await User.findOne({ email: normalizedEmail }).setOptions({ skipTenantScope: true });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const slug = await generateUniqueSlug(restaurantName, async (candidate) =>
    Boolean(await Tenant.exists({ slug: candidate }))
  );

  const tenant = await Tenant.create({
    name: String(restaurantName).trim(),
    slug,
    ownerEmail: normalizedEmail,
    status: 'ACTIVE',
  });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const { owner, roles } = await provisionTenant({
    tenantId: tenant.slug,
    restaurantName: tenant.name,
    owner: { name: String(ownerName).trim(), email: normalizedEmail, passwordHash },
  });

  // Best-effort — registration must succeed even if the email send fails.
  sendVerificationEmailBestEffort(owner);

  return {
    tenant,
    token: issueToken(owner, roles.Admin.name, roles.Admin.permissions),
    user: userResponse(owner, roles.Admin.name, roles.Admin.permissions),
  };
}

async function getMe(userId) {
  const user = await User.findById(userId).populate('role', 'name permissions').select('-passwordHash');
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role ? user.role.name : null,
    permissions: user.role ? user.role.permissions : [],
    tenantId: user.tenantId || 'default',
    branchId: user.branchId || 'main',
    emailVerified: user.emailVerified === true,
  };
}

// POST /api/auth/forgot-password — PUBLIC. ALWAYS resolves with the same
// generic outcome regardless of whether the email exists, so the caller
// (auth.controller.js) can respond with an identical body/status either way
// — no enumeration side-channel.
async function forgotPassword(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return;

  // skipTenantScope: same global-email lookup as login (this runs before any
  // tenant is known).
  const user = await User.findOne({ email: normalizedEmail, active: true }).setOptions({ skipTenantScope: true });
  if (!user) return;

  const { frontendUrl } = getEmailConfig();
  const token = jwt.sign({ sub: user._id.toString(), scope: RESET_SCOPE }, config.jwtSecret, { expiresIn: '30m' });
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  await emailService.sendPasswordResetEmail(user.email, resetLink);
}

// POST /api/auth/reset-password {token, newPassword} — PUBLIC.
async function resetPassword(token, newPassword) {
  const badRequest = (message) => {
    const err = new Error(message);
    err.status = 400;
    return err;
  };
  const unauthorized = (message) => {
    const err = new Error(message);
    err.status = 401;
    return err;
  };

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw unauthorized('Invalid or expired reset link');
  }
  if (payload.scope !== RESET_SCOPE) throw unauthorized('Invalid or expired reset link');

  const user = await User.findById(payload.sub).setOptions({ skipTenantScope: true });
  if (!user) throw unauthorized('Invalid or expired reset link');

  if (isResetTokenInvalidated(user.passwordChangedAt, payload.iat)) {
    throw unauthorized('This reset link has already been used');
  }

  if (!newPassword || String(newPassword).length < 8) {
    throw badRequest('newPassword must be at least 8 characters');
  }

  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  user.passwordChangedAt = new Date();
  await user.save();

  return user;
}

// POST /api/auth/verify-email {token} — PUBLIC.
async function verifyEmail(token) {
  const unauthorized = (message, status) => {
    const err = new Error(message);
    err.status = status || 400;
    return err;
  };

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw unauthorized('Invalid or expired verification link', 401);
  }
  if (payload.scope !== VERIFY_SCOPE) throw unauthorized('Invalid or expired verification link', 401);

  const user = await User.findById(payload.sub).setOptions({ skipTenantScope: true });
  if (!user) throw unauthorized('Invalid or expired verification link', 401);

  if (isVerifyTokenStale(payload.email, user.email)) {
    throw unauthorized('This link is no longer valid', 400);
  }

  user.emailVerified = true;
  await user.save();

  return user;
}

// POST /api/auth/resend-verification — AUTHENTICATED.
async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.emailVerified) {
    const err = new Error('Already verified');
    err.status = 400;
    throw err;
  }

  await sendVerificationEmailBestEffort(user);
  return user;
}

// POST /api/auth/change-password {currentPassword, newPassword} — AUTHENTICATED.
async function changePassword(userId, currentPassword, newPassword) {
  const badRequest = (message) => {
    const err = new Error(message);
    err.status = 400;
    return err;
  };

  // req.user from the JWT is slim — re-fetch the full doc (needs passwordHash).
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const match = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
  if (!match) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }

  if (!newPassword || String(newPassword).length < 8) {
    throw badRequest('newPassword must be at least 8 characters');
  }

  const sameAsCurrent = await bcrypt.compare(String(newPassword), user.passwordHash);
  if (sameAsCurrent) {
    throw badRequest('newPassword must be different from the current password');
  }

  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  user.passwordChangedAt = new Date();
  await user.save();

  return user;
}

// POST /api/auth/change-email {newEmail, currentPassword} — AUTHENTICATED.
async function changeEmail(userId, newEmail, currentPassword) {
  const badRequest = (message) => {
    const err = new Error(message);
    err.status = 400;
    return err;
  };

  const normalizedEmail = String(newEmail || '').toLowerCase().trim();
  if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw badRequest('A valid newEmail is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const match = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
  if (!match) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }

  // Email is unique GLOBALLY across all tenants — same rule as register/login.
  const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } }).setOptions({
    skipTenantScope: true,
  });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  user.email = normalizedEmail;
  user.emailVerified = false;
  await user.save();

  sendVerificationEmailBestEffort(user);

  return user;
}

module.exports = {
  login,
  register,
  getMe,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
  changeEmail,
};
