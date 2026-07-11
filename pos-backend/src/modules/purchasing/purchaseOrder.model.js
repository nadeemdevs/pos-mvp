const mongoose = require('mongoose');

const poLineSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  name: { type: String, required: true },
  unit: { type: String },
  qty: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
  receivedQty: { type: Number, default: 0 },
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    vendorName: { type: String },
    status: {
      type: String,
      enum: ['DRAFT', 'PLACED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
      default: 'DRAFT',
    },
    items: { type: [poLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    expectedAt: { type: Date },
    note: { type: String, default: '' },
  },
  { timestamps: true, branchScoped: true }
);

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
