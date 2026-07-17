const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    // lowercase to match branchId values (plugin default 'main') and the
    // lowercased x-branch-id header in tenantContext — never uppercase here.
    code: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    active: { type: Boolean, default: true },
    // QSR: pay at counter, then print/hand receipt. TABLE_SERVICE: bill is
    // printed and shown to the customer first, payment collected after.
    serviceMode: { type: String, enum: ['QSR', 'TABLE_SERVICE'], default: 'TABLE_SERVICE' },
  },
  { timestamps: true }
);

// Phase 6.1 — branch codes are unique per tenant, not globally (every
// tenant has its own 'main'). Matches migrateTenantIndexes.js.
branchSchema.index({ tenantId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
