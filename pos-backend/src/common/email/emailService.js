const EmailProviderFactory = require('./EmailProviderFactory');
const { getEmailConfig } = require('./emailConfig');
const { passwordResetEmail, verificationEmail } = require('./templates');

// Thin wrappers around the provider factory. Email failures must NEVER break
// the calling flow (a forgot-password/register/etc. request still succeeds
// from the user's perspective) — every function here catches and logs
// instead of throwing.

async function sendPasswordResetEmail(to, resetLink) {
  try {
    const config = getEmailConfig();
    const { subject, html, text } = passwordResetEmail(resetLink);
    const provider = EmailProviderFactory.get(config.provider);
    return await provider.send({ to, subject, html, text });
  } catch (err) {
    console.error('[emailService] sendPasswordResetEmail failed:', err.message);
    return null;
  }
}

async function sendVerificationEmail(to, verifyLink) {
  try {
    const config = getEmailConfig();
    const { subject, html, text } = verificationEmail(verifyLink);
    const provider = EmailProviderFactory.get(config.provider);
    return await provider.send({ to, subject, html, text });
  } catch (err) {
    console.error('[emailService] sendVerificationEmail failed:', err.message);
    return null;
  }
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail };
