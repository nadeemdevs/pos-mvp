// Simple inline-styled HTML templates — no build step, no external
// assets/fonts, plain-text fallback included for every template.

function wrapper(bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="color:#18181b;font-size:16px;line-height:1.5;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;margin:16px 0;">${label}</a>`;
}

function passwordResetEmail(resetLink) {
  const subject = 'Reset your password';
  const html = wrapper(`
    <h2 style="margin:0 0 16px;">Reset your password</h2>
    <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 30 minutes.</p>
    ${button(resetLink, 'Reset Password')}
    <p style="color:#71717a;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
    <p style="color:#71717a;font-size:13px;word-break:break-all;">Or copy this link: ${resetLink}</p>
  `);
  const text = `Reset your password\n\nWe received a request to reset your password. Open this link to choose a new one (expires in 30 minutes):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`;
  return { subject, html, text };
}

function verificationEmail(verifyLink) {
  const subject = 'Verify your email address';
  const html = wrapper(`
    <h2 style="margin:0 0 16px;">Verify your email address</h2>
    <p>Please confirm this is your email address by clicking the button below. This link expires in 24 hours.</p>
    ${button(verifyLink, 'Verify Email')}
    <p style="color:#71717a;font-size:13px;">If you didn't create an account, you can safely ignore this email.</p>
    <p style="color:#71717a;font-size:13px;word-break:break-all;">Or copy this link: ${verifyLink}</p>
  `);
  const text = `Verify your email address\n\nPlease confirm this is your email address by opening this link (expires in 24 hours):\n${verifyLink}\n\nIf you didn't create an account, you can safely ignore this email.`;
  return { subject, html, text };
}

module.exports = { passwordResetEmail, verificationEmail };
