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

async function handleInvoiceRefunded({ invoice } = {}) {
  try {
    await loyaltyService.reverseEarnedPoints(invoice);
  } catch (err) {
    console.error('[loyalty] invoice.refunded handler failed:', err.message);
  }
}

function register() {
  subscribe('invoice.paid', handleInvoicePaid);
  subscribe('invoice.refunded', handleInvoiceRefunded);
}

module.exports = { register };
