const EmailProvider = require('./EmailProvider');
const { getEmailConfig } = require('./emailConfig');

const RESEND_API_URL = 'https://api.resend.com/emails';

// Real implementation against Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// Node 22 ships a global fetch, so no extra dependency is needed for a plain
// JSON-over-HTTPS call like this one.
class ResendProvider extends EmailProvider {
  async send({ to, subject, html, text }) {
    const { apiKey, from } = getEmailConfig();

    if (!apiKey) {
      // Never log the key itself — only that it's missing.
      console.error('[ResendProvider] RESEND_API_KEY is not configured; email not sent');
      throw new Error('Email provider is not configured');
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    const bodyText = await res.text();
    let data;
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch (err) {
      data = { raw: bodyText };
    }

    if (!res.ok) {
      const message = (data && (data.message || data.name)) || `Resend request failed with status ${res.status}`;
      console.error('[ResendProvider] send failed:', res.status, message);
      throw new Error(message);
    }

    return { id: data.id, raw: data };
  }
}

module.exports = ResendProvider;
