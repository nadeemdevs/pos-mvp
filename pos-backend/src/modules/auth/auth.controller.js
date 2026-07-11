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

module.exports = { login, register, me };
