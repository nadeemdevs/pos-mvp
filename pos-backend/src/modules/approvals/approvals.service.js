const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const Setting = require('../settings/setting.model');
const auditService = require('../audit/audit.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

// Verifies a manager PIN against the stored bcrypt hash and, on success,
// issues a short-lived JWT ({scope:'approval'}) the caller can pass back as
// x-approval-token to bypass one gated action (e.g. an over-max discount).
async function verifyPin(pin, user, req) {
  const settings = await getSettings();
  const pinHash = settings.approvals && settings.approvals.pinHash;

  if (!pinHash) {
    throw badRequest('No approval PIN has been configured');
  }

  const match = await bcrypt.compare(String(pin || ''), pinHash);

  if (!match) {
    auditService.log({ req, user, action: 'approval.denied', entity: 'Setting', entityId: settings._id });
    const err = new Error('Incorrect PIN');
    err.status = 401;
    throw err;
  }

  const approvalToken = jwt.sign({ scope: 'approval', by: user.id }, config.jwtSecret, { expiresIn: 120 });

  auditService.log({ req, user, action: 'approval.granted', entity: 'Setting', entityId: settings._id });

  return { approvalToken };
}

// Verifies an x-approval-token header value. Returns { valid, payload }.
function verifyApprovalToken(token) {
  if (!token) return { valid: false };
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.scope !== 'approval') return { valid: false };
    return { valid: true, payload };
  } catch (err) {
    return { valid: false };
  }
}

module.exports = { verifyPin, verifyApprovalToken };
