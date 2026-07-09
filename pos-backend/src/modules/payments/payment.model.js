const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
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
  { timestamps: true }
);

paymentSchema.index({ invoiceId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
