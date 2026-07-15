const mongoose = require('mongoose');

// Phase 6.4b — the platform-level audit trail: activity performed BY platform
// operators against the cross-tenant surface (login, tenant suspend/
// activate, settings changes, feature overrides, ...). Deliberately a
// SEPARATE collection from the existing tenant-scoped AuditLog
// (../audit/auditLog.model.js) — that model records what tenant USERS do
// inside their own tenant/branch; this one records what PLATFORM OPERATORS
// do across the whole platform. tenantScoped:false mirrors
// PlatformOperator/PlatformSettings/Tenant: no tenantId/branchId fields, no
// ambient scoping hooks — this collection lives entirely outside tenancy.
const platformAuditLogSchema = new mongoose.Schema(
  {
    operatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformOperator' },
    operatorEmail: { type: String },
    // e.g. 'operator.login', 'tenant.suspended', 'tenant.activated',
    // 'tenant.features_overridden', 'platform.settings_updated'.
    action: { type: String, required: true, index: true },
    entity: { type: String, index: true },
    entityId: { type: mongoose.Schema.Types.Mixed, index: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, tenantScoped: false }
);

module.exports = mongoose.model('PlatformAuditLog', platformAuditLogSchema);
