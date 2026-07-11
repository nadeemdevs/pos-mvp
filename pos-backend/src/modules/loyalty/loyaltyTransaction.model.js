const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    type: { type: String, enum: ['EARN', 'REDEEM', 'ADJUST', 'REFERRAL'], required: true },
    // Signed — EARN/REFERRAL positive, REDEEM negative, ADJUST either.
    points: { type: Number, required: true },
    refType: { type: String, enum: ['INVOICE', 'MANUAL'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, default: '' },
    // Customer's spendable balance immediately after this transaction — a
    // point-in-time snapshot for auditability/statements.
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
