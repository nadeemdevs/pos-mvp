// Central place where every event-bus subscriber gets wired up. Required
// once from server.js, after the DB connection is established, so all
// 'order.completed' / 'invoice.paid' / etc. listeners are registered before
// any request can trigger them.
const auditSubscriber = require('../modules/audit/audit.subscriber');
const stockDeductionSubscriber = require('../modules/inventory/stockDeduction.subscriber');
const loyaltySubscriber = require('../modules/loyalty/loyalty.subscriber');
const reservationsSubscriber = require('../modules/reservations/reservations.subscriber');

function init() {
  auditSubscriber.register();
  stockDeductionSubscriber.register();
  loyaltySubscriber.register();
  reservationsSubscriber.register();
  console.log('[subscribers] registered: audit, stockDeduction, loyalty, reservations');
}

module.exports = { init };
