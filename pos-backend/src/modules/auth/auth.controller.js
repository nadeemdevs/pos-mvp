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
  });

  res.json(result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  res.json(user);
});

module.exports = { login, me };
