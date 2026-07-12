const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const PlatformOperator = require('./platformOperator.model');

const PLATFORM_SCOPE = 'platform-operator';
const PLATFORM_TOKEN_EXPIRES_IN = '12h';

function issuePlatformToken(operator) {
  return jwt.sign({ sub: operator._id.toString(), scope: PLATFORM_SCOPE }, config.jwtSecret, {
    expiresIn: PLATFORM_TOKEN_EXPIRES_IN,
  });
}

function operatorResponse(operator) {
  return { id: operator._id, name: operator.name, email: operator.email };
}

// POST /api/platform/auth/login — PUBLIC. Completely separate identity space
// from tenant Users: this NEVER touches the User collection, so a leaked
// tenant admin credential has zero path to a platform token.
async function login(email, password) {
  const unauthorized = (message) => {
    const err = new Error(message);
    err.status = 401;
    return err;
  };

  const normalizedEmail = String(email || '').toLowerCase().trim();
  const operator = await PlatformOperator.findOne({ email: normalizedEmail });
  if (!operator) throw unauthorized('Invalid email or password');
  if (operator.active !== true) throw unauthorized('This operator account is inactive');

  const match = await bcrypt.compare(String(password || ''), operator.passwordHash);
  if (!match) throw unauthorized('Invalid email or password');

  return {
    token: issuePlatformToken(operator),
    operator: operatorResponse(operator),
  };
}

module.exports = { login, operatorResponse, PLATFORM_SCOPE };
