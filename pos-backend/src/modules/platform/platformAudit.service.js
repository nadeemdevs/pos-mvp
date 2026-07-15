const PlatformAuditLog = require('./platformAuditLog.model');

// Fire-and-forget audit helper for the platform-operator surface — mirrors
// ../audit/audit.service.js's resilience contract exactly: never throws, so
// a failed audit write can never break the caller's main operation (login,
// tenant suspend/activate, settings/feature writes).
async function log({ operatorId, operatorEmail, action, entity, entityId, meta } = {}) {
  try {
    await PlatformAuditLog.create({
      operatorId,
      operatorEmail,
      action,
      entity,
      entityId,
      meta,
    });
  } catch (err) {
    console.error('[platformAudit] failed to write platform audit log:', err.message);
  }
}

module.exports = { log };
