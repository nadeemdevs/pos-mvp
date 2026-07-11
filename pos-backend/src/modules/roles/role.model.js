const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Phase 6.1 — role names are unique per tenant, not globally (every tenant
// gets its own Admin/Manager/... set). Matches migrateTenantIndexes.js.
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
