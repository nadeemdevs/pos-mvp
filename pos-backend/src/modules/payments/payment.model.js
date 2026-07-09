const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    method: {
      type: String,
      enum: ['CASH', 'UPI', 'PINELABS', 'WORLDLINE'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    tendered: { type: Number },
    change: { type: Number, default: 0 },
    reference: { type: String },
    status: {
      type: String,
      enum: ['SUCCESS', 'PENDING', 'FAILED'],
      default: 'SUCCESS',
    },
    receivedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
