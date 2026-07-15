const ResendProvider = require('./ResendProvider');
const SendgridProvider = require('./SendgridProvider');
const PostmarkProvider = require('./PostmarkProvider');

// Mirrors PaymentProviderFactory.js exactly — one factory, keyed by provider
// name, so callers never `new` a concrete provider directly.
const providers = {
  RESEND: ResendProvider,
  SENDGRID: SendgridProvider,
  POSTMARK: PostmarkProvider,
};

function get(providerName) {
  const Provider = providers[providerName];
  if (!Provider) {
    const err = new Error(`Unsupported email provider: ${providerName}`);
    err.status = 400;
    throw err;
  }
  return new Provider();
}

module.exports = { get };
