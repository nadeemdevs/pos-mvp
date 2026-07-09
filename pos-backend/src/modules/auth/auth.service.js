const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const User = require('../users/user.model');

async function login(email, password) {
  const user = await User.findOne({ email: (email || '').toLowerCase(), active: true }).populate(
    'role',
    'name permissions'
  );

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

  const roleName = user.role ? user.role.name : null;
  const permissions = user.role ? user.role.permissions : [];

  const token = jwt.sign(
    { id: user._id.toString(), name: user.name, role: roleName, permissions },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: roleName,
      permissions,
    },
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
  };
}

module.exports = { login, getMe };
