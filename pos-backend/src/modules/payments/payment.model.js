const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    // PAYMENT = money collected (the default, covers every payment recorded
    // before this field existed). REFUND = money given back — created by
    // billing.service.refundInvoice / settleDelta. Reporting aggregations
    // must net PAYMENT minus REFUND per method/day (see reports.controller.js).
    type: { type: String, enum: ['PAYMENT', 'REFUND'], default: 'PAYMENT' },
    method: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'PINELABS', 'WORLDLINE'],
      required: true,
    },
    // Card-terminal vendor (or CASH/UPI for manual payments, kept for consistency).
    provider: {
      type: String,
      enum: ['CASH', 'UPI', 'MOCK', 'PINELABS', 'WORLDLINE'],
    },
    amount: { type: Number, required: true, min: 0 },
    tendered: { type: Number },
    change: { type: Number, default: 0 },
    reference: { type: String },
    status: {
      type: String,
      enum: ['INITIATED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT', 'PENDING'],
      default: 'SUCCESS',
    },
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    cardDetails: {
      maskedPan: { type: String },
      authCode: { type: String },
      cardType: { type: String },
    },
    failureReason: { type: String },
    receivedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
  },
  { timestamps: true, branchScoped: true }
);

paymentSchema.index({ invoiceId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
