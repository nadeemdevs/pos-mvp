const mongoose = require('mongoose');

// Phase 6.4a — platform-wide settings singleton (mirrors setting.model.js's
// singleton-per-tenant pattern, except this is a singleton for the WHOLE
// platform: tenantScoped:false, no tenantId at all, exactly one document
// ever exists). Read via PlatformSettings.findOne() and upserted on save —
// see platform.controller.js's getSettings/updateSettings.
const emailProviderSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['RESEND', 'SENDGRID', 'POSTMARK'], default: 'RESEND' },
    // Never returned in plaintext by GET /api/platform/settings — only a
    // masked preview (see platform.controller.js#serializeSettings).
    apiKey: { type: String, default: '' },
    fromAddress: { type: String, default: '' },
  },
  { _id: false }
);

const platformSettingsSchema = new mongoose.Schema(
  {
    emailProvider: { type: emailProviderSchema, default: () => ({}) },
    defaultTrialDays: { type: Number, default: 14 },
    supportEmail: { type: String, default: '' },
    // Not yet enforced everywhere — see auth.service.js's maintenance-mode
    // gate on login/register. Operators themselves are never blocked by it.
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, tenantScoped: false }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
