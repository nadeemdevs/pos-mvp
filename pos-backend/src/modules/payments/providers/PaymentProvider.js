class PaymentProvider {
  // eslint-disable-next-line no-unused-vars
  async processManual(invoice, { amount, reference }) {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async initiate(invoice) {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async handleCallback(payload) {
    throw new Error('Not implemented');
  }
}

module.exports = PaymentProvider;
