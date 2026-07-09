const PaymentProvider = require('./PaymentProvider');

class PineLabsProvider extends PaymentProvider {
  async initiate() {
    throw new Error('Not implemented');
  }

  async handleCallback() {
    throw new Error('Not implemented');
  }
}

module.exports = PineLabsProvider;
