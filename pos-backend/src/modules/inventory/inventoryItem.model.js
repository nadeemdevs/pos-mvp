const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, enum: ['g', 'kg', 'ml', 'l', 'pc'], required: true },
    category: { type: String, default: '' },
    currentStock: { type: Number, default: 0 },
    minStock: { type: Number, default: 0 },
    avgCost: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, branchScoped: true }
);

// One item per name, per tenant+branch — mirrors the tenant-scoping story
// even though today every doc shares tenantId:'default'/branchId:'main'.
inventoryItemSchema.index({ tenantId: 1, branchId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
