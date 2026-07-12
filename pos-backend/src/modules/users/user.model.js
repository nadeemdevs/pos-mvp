const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    active: { type: Boolean, default: true },
    // Phase 6.2 — platform (cross-tenant) super-admin flag. Deliberately NOT
    // settable through ANY API path (register/user-create/user-update all use
    // explicit field lists that omit it): only seed/scripts may set it, so a
    // tenant admin can never escalate themselves to platform admin by POSTing
    // { platformAdmin: true }.
    platformAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
