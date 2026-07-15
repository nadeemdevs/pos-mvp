const mongoose = require('mongoose');

const modifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

// Recipe is embedded directly on MenuItem rather than modeled as separate
// Recipe/RecipeIngredient collections (a deliberate deviation from the
// phase doc — same rationale as embedding order items on Order: a menu
// item's recipe is only ever read/written alongside the item itself, so a
// join buys nothing). qty is "how much of this inventory item is consumed
// per 1 sold unit of the menu item"; unit is a display snapshot of the
// inventory item's unit at the time the recipe line was saved.
const recipeLineSchema = new mongoose.Schema(
  {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String },
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
    recipe: { type: [recipeLineSchema], default: [] },
  },
  { timestamps: true }
);

menuItemSchema.index({ name: 'text' });

module.exports = mongoose.model('MenuItem', menuItemSchema);
