const mongoose = require('mongoose');

const loyaltySchema = new mongoose.Schema(
  {
    // Spendable balance — decremented on redemption.
    points: { type: Number, default: 0 },
    // Never decreases (except manual ADJUST) — used to compute tier.
    lifetimePoints: { type: Number, default: 0 },
    tier: { type: String, default: 'Bronze' },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    notes: { type: String },
    loyalty: { type: loyaltySchema, default: () => ({}) },
    // Set at creation time if this customer was referred by an existing one.
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    // Guards against awarding the referral bonus more than once, across
    // however many of the referred customer's invoices get paid.
    referralRewarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Phase 6.1 — phone numbers are unique per tenant, not globally (the same
// customer can exist at two different restaurants). Matches
// migrateTenantIndexes.js.
customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);
