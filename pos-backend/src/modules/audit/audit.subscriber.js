const { subscribe } = require('../../common/eventBus');
const auditService = require('./audit.service');

// order.completed doesn't originate from an HTTP request (it's published
// from orders.service.settleInvoicePaid, which may itself be triggered by a
// payment webhook), so there's no `req` to pull user context from — the
// order's own waiter is the closest thing to an actor.
function register() {
  subscribe('order.completed', ({ order } = {}) => {
    if (!order) return;
    auditService.log({
      user: order.waiter,
      action: 'order.completed',
      entity: 'Order',
      entityId: order._id,
      meta: { orderNumber: order.orderNumber, total: order.total },
      tenantId: order.tenantId,
      branchId: order.branchId,
    });
  });
}

module.exports = { register };
