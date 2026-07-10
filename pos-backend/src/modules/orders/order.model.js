const mongoose = require('mongoose');

const orderItemModifierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 0, min: 0 },
  qty: { type: Number, required: true, min: 1 },
  modifiers: { type: [orderItemModifierSchema], default: [] },
  note: { type: String, default: '' },
  // null until the item is fired onto a KOT; then it's immutable.
  kotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kot', default: null },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['DINE_IN', 'TAKEAWAY'], default: 'DINE_IN' },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    tableName: { type: String },
    guestCount: { type: Number, default: 1 },
    waiter: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    items: { type: [orderItemSchema], default: [] },
    status: {
      type: String,
      enum: ['OPEN', 'BILL_REQUESTED', 'INVOICED', 'PAID', 'CLOSED', 'CANCELLED'],
      default: 'OPEN',
    },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    invoiceIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Invoice', default: [] },
    note: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

// No `next` callback param — Mongoose 9 treats a zero-arg pre-hook as
// synchronous; the legacy callback style (`function(next) {...next()}`)
// blows up with "next is not a function" on this Mongoose version.
orderSchema.pre('validate', function preValidate() {
  if (this.type === 'DINE_IN' && !this.tableId) {
    this.invalidate('tableId', 'tableId is required for DINE_IN orders');
  }
});

module.exports = mongoose.model('Order', orderSchema);
