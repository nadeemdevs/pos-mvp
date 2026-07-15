const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    active: { type: Boolean, default: true },
    // Phase 6.3 — email verification + password-reset-token invalidation.
    emailVerified: { type: Boolean, default: false },
    // Bumped on every password change (reset OR self-service change). Any
    // outstanding password-reset JWT issued before this timestamp (compared
    // against the token's `iat`) is rejected — a JWT-invalidation-without-a-
    // blacklist trick, see auth.tokenInvalidation.js.
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
