const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    // lowercase to match branchId values (plugin default 'main') and the
    // lowercased x-branch-id header in tenantContext — never uppercase here.
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Branch', branchSchema);
