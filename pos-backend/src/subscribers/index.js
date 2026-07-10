// Central place where every event-bus subscriber gets wired up. Required
// once from server.js, after the DB connection is established, so all
// 'order.completed' / 'invoice.paid' / etc. listeners are registered before
// any request can trigger them.
const auditSubscriber = require('../modules/audit/audit.subscriber');
const stockDeductionSubscriber = require('../modules/inventory/stockDeduction.subscriber');

function init() {
  auditSubscriber.register();
  stockDeductionSubscriber.register();
  console.log('[subscribers] registered: audit, stockDeduction');
}

module.exports = { init };
