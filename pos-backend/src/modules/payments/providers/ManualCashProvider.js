const PaymentProvider = require('./PaymentProvider');

class ManualCashProvider extends PaymentProvider {
  async processManual(invoice, { amount, reference }) {
    if (amount < invoice.total) {
      const err = new Error('Cash amount is less than invoice total');
      err.status = 400;
      throw err;
    }

    const change = Math.round((amount - invoice.total) * 100) / 100;

    return {
      method: 'CASH',
      // amount is what the sale collected; tendered/change track the cash exchange
      amount: invoice.total,
      tendered: amount,
      change,
      reference: reference || null,
      status: 'SUCCESS',
    };
  }
}

module.exports = ManualCashProvider;
