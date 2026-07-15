const EmailProviderFactory = require('./EmailProviderFactory');
const { getEmailConfig } = require('./emailConfig');
const { passwordResetEmail, verificationEmail } = require('./templates');

// Thin wrappers around the provider factory. Email failures must NEVER break
// the calling flow (a forgot-password/register/etc. request still succeeds
// from the user's perspective) — every function here catches and logs
// instead of throwing.

// Phase 6.4b — minimal, non-invasive last-attempt tracker for
// GET /api/platform/health's email signal. Module-level (single process,
// single in-memory value — no persistence needed, this is just "did the last
// send attempt succeed"). Updated after EVERY send attempt below, success or
// failure, for either template.
let lastEmailAttempt = null;

function recordEmailAttempt(success, error) {
  lastEmailAttempt = { at: new Date(), success, error: error || null };
}

function getLastEmailAttempt() {
  return lastEmailAttempt;
}

async function sendPasswordResetEmail(to, resetLink) {
  try {
    const config = getEmailConfig();
    const { subject, html, text } = passwordResetEmail(resetLink);
    const provider = EmailProviderFactory.get(config.provider);
    const result = await provider.send({ to, subject, html, text });
    recordEmailAttempt(true);
    return result;
  } catch (err) {
    console.error('[emailService] sendPasswordResetEmail failed:', err.message);
    recordEmailAttempt(false, err.message);
    return null;
  }
}

async function sendVerificationEmail(to, verifyLink) {
  try {
    const config = getEmailConfig();
    const { subject, html, text } = verificationEmail(verifyLink);
    const provider = EmailProviderFactory.get(config.provider);
    const result = await provider.send({ to, subject, html, text });
    recordEmailAttempt(true);
    return result;
  } catch (err) {
    console.error('[emailService] sendVerificationEmail failed:', err.message);
    recordEmailAttempt(false, err.message);
    return null;
  }
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail, getLastEmailAttempt };
