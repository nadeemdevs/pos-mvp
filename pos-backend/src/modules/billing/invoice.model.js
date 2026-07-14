const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    taxRate: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    // Populated only when settings.country was 'India' at the time this
    // invoice's tax was (re)computed — sgst+cgst always equals `tax` above.
    // Zero on invoices from non-Indian stores, so old invoices keep showing
    // a single "Tax" line even if the setting is toggled on later.
    sgst: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    discountType: { type: String, enum: ['FLAT', 'PERCENT'], default: 'FLAT' },
    discountValue: { type: Number, default: 0, min: 0 },
    roundOff: { type: Number, default: 0 },
    total: { type: Number, required: true, default: 0 },
    note: { type: String },
    customer: {
      name: { type: String },
      phone: { type: String },
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    status: {
      type: String,
      enum: ['OPEN', 'HELD', 'CANCELLED', 'CLOSED'],
      default: 'OPEN',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'REFUNDED'],
      default: 'PENDING',
    },
    paymentMethod: { type: String },
    paymentTransactionId: { type: String },
    cashier: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    // Present only for invoices created from a dine-in Order (Mode 2) via
    // InvoiceService.createFromOrder. Mode 1 invoices (POST /api/invoice)
    // leave these unset and behave exactly as before.
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    orderNumber: { type: String },
    // Idempotency guard for the automatic recipe-based stock deduction
    // subscriber — only relevant for Mode 1 (counter sale) invoices, i.e.
    // orderId unset. See src/modules/inventory/stockDeduction.subscriber.js.
    stockDeducted: { type: Boolean, default: false },
    // Idempotency guard for the loyalty-earning subscriber (Phase 5.2) — same
    // atomic-claim pattern as stockDeducted. See loyalty.service.processInvoicePaid.
    loyaltyProcessed: { type: Boolean, default: false },
    // Set by POST /api/loyalty/redeem — points spent against this invoice and
    // the resulting discount amount already folded into `total` above.
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyDiscount: { type: Number, default: 0 },
  },
  { timestamps: true, branchScoped: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
