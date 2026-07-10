const mongoose = require('mongoose');

const modifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    modifiers: { type: [modifierSchema], default: [] },
  },
  { timestamps: true }
);

menuItemSchema.index({ name: 'text' });

module.exports = mongoose.model('MenuItem', menuItemSchema);
