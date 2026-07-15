const EmailProvider = require('./EmailProvider');

// Stub — not implemented in this phase. Exists so a future phase can wire up
// Postmark behind the same EmailProvider interface without touching any call
// site (mirrors the PineLabsProvider/WorldlineProvider placeholder pattern in
// the payments module).
class PostmarkProvider extends EmailProvider {
  // eslint-disable-next-line no-unused-vars
  async send({ to, subject, html, text }) {
    throw new Error('Not implemented');
  }
}

module.exports = PostmarkProvider;
