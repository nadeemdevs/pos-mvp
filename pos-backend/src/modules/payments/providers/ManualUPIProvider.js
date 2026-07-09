const PaymentProvider = require('./PaymentProvider');

class ManualUPIProvider extends PaymentProvider {
  async processManual(invoice, { amount, reference }) {
    if (amount !== invoice.total) {
      const err = new Error('UPI amount must equal invoice total');
      err.status = 400;
      throw err;
    }

    return {
      method: 'UPI',
      amount,
      change: 0,
      reference: reference || null,
      status: 'SUCCESS',
    };
  }
}

module.exports = ManualUPIProvider;
