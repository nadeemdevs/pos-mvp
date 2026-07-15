const mongoose = require('mongoose');

// Platform-level tenant registry — the ONE model that is not tenant-scoped
// (tenantScoped: false disables the global plugin entirely, see
// common/database/tenantPlugin.js). A tenant's `slug` doubles as the
// tenantId value stamped on every document that belongs to it (human
// readable, and matches the pre-existing 'default' tenant).
const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerEmail: { type: String, lowercase: true, trim: true },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  },
  { timestamps: true, tenantScoped: false }
);

module.exports = mongoose.model('Tenant', tenantSchema);
