const PaymentProvider = require('./PaymentProvider');

class WorldlineProvider extends PaymentProvider {
  async initiate() {
    throw new Error('Not implemented');
  }

  async handleCallback() {
    throw new Error('Not implemented');
  }
}

module.exports = WorldlineProvider;
