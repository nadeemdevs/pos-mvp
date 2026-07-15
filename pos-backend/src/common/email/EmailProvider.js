class EmailProvider {
  /**
   * Send an email.
   * @param {{to: string, subject: string, html: string, text: string}} message
   * @returns {Promise<{id?: string, raw?: any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async send({ to, subject, html, text }) {
    throw new Error('Not implemented');
  }
}

module.exports = EmailProvider;
