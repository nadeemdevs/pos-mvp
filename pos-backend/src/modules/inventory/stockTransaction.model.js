const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema(
  {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    type: {
      type: String,
      enum: ['PURCHASE', 'CONSUMPTION', 'ADJUSTMENT', 'WASTAGE', 'RETURN'],
      required: true,
    },
    // Signed: positive adds stock, negative removes.
    qty: { type: Number, required: true },
    unitCost: { type: Number },
    refType: { type: String, enum: ['ORDER', 'INVOICE', 'PO', 'MANUAL'] },
    refId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, default: '' },
    balanceAfter: { type: Number },
    by: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
  },
  { timestamps: true, branchScoped: true }
);

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
