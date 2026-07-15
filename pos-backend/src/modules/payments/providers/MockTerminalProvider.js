const PaymentProvider = require('./PaymentProvider');

// Module-level store so the mock "terminal" remembers when a transaction started,
// keyed by our own reference. This is dev-only scaffolding — nothing here needs to
// survive a process restart, so an in-memory Map (with a payment.createdAt fallback
// for resumed/stale payments) is fine.
const store = new Map();

class MockTerminalProvider extends PaymentProvider {
  async initiatePayment(invoice, payment) {
    const reference = `MOCK-${payment._id}`;
    store.set(reference, { startedAt: Date.now() });

    return {
      reference,
      status: 'PROCESSING',
      rawResponse: { simulated: true, reference, amount: invoice.total },
    };
  }

  async getStatus(payment, config) {
    const mockConfig = (config && config.mock) || {};
    const delayMs = mockConfig.delayMs ?? 5000;
    const outcome = mockConfig.outcome || 'SUCCESS';

    let entry = store.get(payment.reference);
    if (!entry) {
      // Fallback for a resumed payment whose in-memory state was lost (server
      // restart) — treat payment.createdAt as the start of the "swipe".
      entry = { startedAt: payment.createdAt ? new Date(payment.createdAt).getTime() : Date.now() };
      store.set(payment.reference, entry);
    }

    const elapsed = Date.now() - entry.startedAt;

    if (elapsed < delayMs) {
      return { status: 'PROCESSING', rawResponse: { elapsed, delayMs, outcome: 'pending' } };
    }

    if (outcome === 'TIMEOUT') {
      // Deliberately never resolves — the poller's 120s ceiling is what ends this.
      return { status: 'PROCESSING', rawResponse: { elapsed, delayMs, outcome: 'timeout-simulated' } };
    }

    if (outcome === 'FAILED') {
      return {
        status: 'FAILED',
        rawResponse: { elapsed, delayMs, outcome },
        failureReason: 'Declined by issuer',
      };
    }

    return {
      status: 'SUCCESS',
      rawResponse: { elapsed, delayMs, outcome },
      cardDetails: { maskedPan: '**** **** **** 4242', authCode: 'A1B2C3', cardType: 'VISA' },
    };
  }

  async cancelPayment(payment) {
    store.delete(payment.reference);
    return { status: 'CANCELLED', rawResponse: { cancelled: true } };
  }
}

module.exports = MockTerminalProvider;
