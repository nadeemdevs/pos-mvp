const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const User = require('../users/user.model');
const Role = require('../roles/role.model');
const Tenant = require('../tenants/tenant.model');
const { generateUniqueSlug } = require('../tenants/slug');
const { provisionTenant } = require('../../common/database/provisionTenant');

function issueToken(user, roleName, permissions) {
  return jwt.sign(
    {
      id: user._id.toString(),
      name: user.name,
      role: roleName,
      permissions,
      tenantId: user.tenantId || 'default',
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
  };
}

async function login(email, password) {
  // skipTenantScope: login runs BEFORE any tenant is known (the ambient
  // context is the 'default' fallback) and email is unique GLOBALLY, so the
  // user must be found across all tenants.
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
  };
}

module.exports = { login, register, getMe };
