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

const orderSourceSchema = new mongoose.Schema(
  {
    partner: { type: String }, // e.g. 'zomato' | 'swiggy'
    externalId: { type: String }, // the partner's own order id — idempotency key
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['DINE_IN', 'TAKEAWAY'], default: 'DINE_IN' },
    // Where the order originated. 'POS' (default) covers everything created
    // by staff today; 'QR'/'ONLINE' are guest self-order channels (Phase 5.3
    // public API); 'DELIVERY' is a partner webhook order.
    channel: { type: String, enum: ['POS', 'QR', 'ONLINE', 'DELIVERY'], default: 'POS' },
    // Set only for channel 'DELIVERY' — which partner and their own order id,
    // used as the idempotency key for repeat webhook deliveries.
    source: { type: orderSourceSchema },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    tableName: { type: String },
    guestCount: { type: Number, default: 1 },
    waiter: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    // Guest snapshot for QR/online/delivery orders — mirrors Invoice.customer.
    customer: {
      name: { type: String },
      phone: { type: String },
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    // Opaque token handed back to a QR/online guest so they can poll
    // GET /api/public/orders/:id/status?token= without authenticating.
    publicToken: { type: String, index: true, sparse: true },
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
    // Idempotency guard for the automatic recipe-based stock deduction
    // subscriber (src/modules/inventory/stockDeduction.subscriber.js) —
    // claimed atomically via findOneAndUpdate before deducting, so a
    // duplicate 'order.completed' publish never double-deducts.
    stockDeducted: { type: Boolean, default: false },
  },
  { timestamps: true, branchScoped: true }
);

// Idempotency guard for the delivery-webhook module (Phase 5.3): a repeat
// webhook for the same partner order must return the SAME order, never
// create a duplicate. Sparse — only DELIVERY-channel orders set `source`.
orderSchema.index(
  { 'source.partner': 1, 'source.externalId': 1 },
  { unique: true, sparse: true }
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
