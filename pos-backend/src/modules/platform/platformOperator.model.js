const mongoose = require('mongoose');

// Phase 6.4a — the platform (cross-tenant) operator identity. Deliberately a
// COMPLETELY SEPARATE collection/identity from tenant Users: no tenantId/
// branchId (tenantScoped: false, mirrors Tenant in ../tenants/tenant.model.js),
// no role/permissions, no relationship to any tenant whatsoever. A leaked or
// compromised restaurant admin account (a tenant User) can never grant
// platform-wide control, because platform auth never looks at the User
// collection at all — see platformAuth.service.js / requirePlatformAuth.js.
const platformOperatorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, tenantScoped: false }
);

module.exports = mongoose.model('PlatformOperator', platformOperatorSchema);
