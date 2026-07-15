const { subscribe } = require('../../common/eventBus');
const loyaltyService = require('./loyalty.service');

async function handleInvoicePaid({ invoice } = {}) {
  try {
    await loyaltyService.processInvoicePaid(invoice);
  } catch (err) {
    // Loyalty processing failures must never break the payment flow.
    console.error('[loyalty] invoice.paid handler failed:', err.message);
  }
}

function register() {
  subscribe('invoice.paid', handleInvoicePaid);
}

module.exports = { register };
