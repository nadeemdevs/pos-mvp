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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
