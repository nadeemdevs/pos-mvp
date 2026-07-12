// Single resolution point for email-delivery config. Every send() call site
// MUST go through getEmailConfig() rather than reading process.env directly.
//
// Phase 6.4a — this is the swap-in anticipated by the comment that used to
// live here: getEmailConfig() now checks a PlatformSettings document FIRST
// and falls back to the env-var behaviour exactly as before when no
// override is configured (or it's incomplete). getEmailConfig() itself stays
// SYNCHRONOUS on purpose — every existing call site (emailService.js,
// auth.service.js) calls it without awaiting, so touching those call sites
// to add `await` was avoided entirely. Instead, the PlatformSettings doc is
// read into an in-memory cache asynchronously (on module load, and again
// whenever PUT /api/platform/settings changes the email provider config —
// see platform.controller.js#updateSettings), and getEmailConfig() just
// reads that cache synchronously.
const PlatformSettings = require('../../modules/platform/platformSettings.model');

// null until the first successful cache refresh finds a doc with a
// configured provider+apiKey; stays null (or reverts to null) whenever the
// operator hasn't configured an override, or clears the override.
let cachedPlatformEmailProvider = null;

function envEmailConfig() {
  return {
    provider: process.env.EMAIL_PROVIDER || 'RESEND',
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
}

// Pure, DB-free — unit tested directly (emailConfig.test.js). `platformEmailProvider`
// is the raw `emailProvider` subdocument (or null) from the PlatformSettings
// cache; only used as an override when BOTH provider and apiKey are set —
// an incomplete override (e.g. provider picked but no key saved yet) must
// not silently break the working env-var setup.
function resolveEmailConfig(env, platformEmailProvider) {
  if (platformEmailProvider && platformEmailProvider.provider && platformEmailProvider.apiKey) {
    return {
      provider: platformEmailProvider.provider,
      apiKey: platformEmailProvider.apiKey,
      from: platformEmailProvider.fromAddress || env.from,
      frontendUrl: env.frontendUrl,
    };
  }
  return env;
}

function getEmailConfig() {
  return resolveEmailConfig(envEmailConfig(), cachedPlatformEmailProvider);
}

// Re-reads the PlatformSettings singleton into the in-memory cache. Called
// once (best-effort) at module load, and explicitly by
// platform.controller.js#updateSettings right after a settings write so an
// operator's change takes effect immediately rather than waiting for the
// next process restart.
async function refreshEmailConfigCache() {
  try {
    const doc = await PlatformSettings.findOne().lean();
    cachedPlatformEmailProvider = (doc && doc.emailProvider) || null;
  } catch (err) {
    // Fail open — leave whatever was cached (or null) in place, so a
    // transient DB hiccup degrades to the env-var fallback rather than
    // throwing from inside a fire-and-forget email send.
  }
}

// Best-effort warm-up. If this fails (e.g. DB not reachable yet at boot),
// getEmailConfig() simply behaves exactly as it did before this phase.
refreshEmailConfigCache().catch(() => {});

module.exports = { getEmailConfig, refreshEmailConfigCache, resolveEmailConfig };
