const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    zone: { type: String, default: 'Main' },
    capacity: { type: Number, default: 4 },
    status: { type: String, enum: ['FREE', 'OCCUPIED', 'BILLED'], default: 'FREE' },
    currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    // QR/online ordering (Phase 5.3) — opaque token embedded in the table's QR
    // code; resolves to this table at GET /api/public/table/:qrToken with no
    // auth. Regenerated via POST /api/tables/:id/qr-token (invalidates the old
    // code, e.g. if a printed QR sticker is compromised/replaced).
    qrToken: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, branchScoped: true }
);

// Phase 6.1 — table names are unique per tenant+branch, not globally.
// Matches migrateTenantIndexes.js. qrToken stays globally unique (it's the
// tenant-resolution key for the public QR flow).
tableSchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Table', tableSchema);
