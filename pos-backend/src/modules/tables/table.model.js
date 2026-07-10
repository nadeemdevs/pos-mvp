const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    zone: { type: String, default: 'Main' },
    capacity: { type: Number, default: 4 },
    status: { type: String, enum: ['FREE', 'OCCUPIED', 'BILLED'], default: 'FREE' },
    currentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Table', tableSchema);
