const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    // e.g. 'stock.adjust', 'po.receive', 'auth.login', 'settings.update', 'order.completed'
    action: { type: String, required: true, index: true },
    entity: { type: String, index: true },
    entityId: { type: mongoose.Schema.Types.Mixed, index: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
