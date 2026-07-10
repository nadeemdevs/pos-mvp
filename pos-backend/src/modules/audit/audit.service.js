const AuditLog = require('./auditLog.model');

// Fire-and-forget audit helper. Never throws — a failed audit write must
// never break the caller's main operation (per Phase 5.1 spec). Callers may
// pass either `req` (to pull user/tenant/branch context automatically) or an
// explicit `user`/`tenantId`/`branchId`.
async function log({ req, user, action, entity, entityId, meta, tenantId, branchId } = {}) {
  try {
    const actor = user || (req && req.user);

    await AuditLog.create({
      userId: actor ? actor.id : undefined,
      userName: actor ? actor.name : undefined,
      action,
      entity,
      entityId,
      meta,
      tenantId: tenantId || (req && req.tenantId) || 'default',
      branchId: branchId || (req && req.branchId) || 'main',
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = { log };
