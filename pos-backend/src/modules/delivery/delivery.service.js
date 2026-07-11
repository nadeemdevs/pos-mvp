const Order = require('../orders/order.model');
const ordersService = require('../orders/orders.service');
const customersService = require('../customers/customers.service');
const factory = require('./DeliveryProviderFactory');
const { nextOrderNumber } = require('../../common/utils/orderNumber');
const { emitTo } = require('../../sockets');
const eventBus = require('../../common/eventBus');
const auditService = require('../audit/audit.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  throw err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  throw err;
}

function unauthorized(message) {
  const err = new Error(message);
  err.status = 401;
  throw err;
}

async function createOrGetOrder(partner, mapped) {
  const { externalId, customer, lines, unmatched } = mapped;

  if (!externalId) badRequest('externalId is required');
  if (unmatched.length) badRequest(`Could not match menu items: ${unmatched.join(', ')}`);
  if (!lines.length) badRequest('items must resolve to at least one menu item');

  const existing = await Order.findOne({ 'source.partner': partner, 'source.externalId': externalId });
  if (existing) return { order: existing, created: false };

  const orderNumber = await nextOrderNumber();
  const { subtotal, tax, total } = ordersService.computeOrderTotals(lines);

  let customerDoc = null;
  if (customer && customer.phone) {
    customerDoc = await customersService.upsertByPhone(customer);
  }

  let order;
  try {
    order = await Order.create({
      orderNumber,
      type: 'TAKEAWAY',
      channel: 'DELIVERY',
      source: { partner, externalId },
      waiter: { name: `${partner} webhook` },
      customer: customer ? { name: customer.name, phone: customer.phone } : undefined,
      customerId: customerDoc ? customerDoc._id : undefined,
      items: lines,
      status: 'OPEN',
      subtotal,
      tax,
      total,
    });
  } catch (err) {
    // Two near-simultaneous deliveries of the same webhook race past the
    // findOne check above — the unique (source.partner, source.externalId)
    // index catches the duplicate; fall back to returning the winner's order
    // instead of surfacing a 500/409 for what is, semantically, a retry.
    if (err.code === 11000) {
      const winner = await Order.findOne({ 'source.partner': partner, 'source.externalId': externalId });
      if (winner) return { order: winner, created: false };
    }
    throw err;
  }

  emitTo('floor', 'order.created', ordersService.orderSummary(order));
  eventBus.publish('order.created', { order });

  auditService.log({
    action: 'delivery.order',
    entity: 'Order',
    entityId: order._id,
    meta: { partner, externalId, orderNumber },
  });

  return { order, created: true };
}

async function cancelByExternalId(partner, externalId) {
  if (!externalId) badRequest('externalId is required');

  const order = await Order.findOne({ 'source.partner': partner, 'source.externalId': externalId });
  if (!order) notFound('Order not found for that externalId');

  if (order.status === 'CANCELLED') return { order, cancelled: true };

  // Reuses the standard order-cancel path (FSM-validated: only OPEN/
  // BILL_REQUESTED may cancel — an already-INVOICED delivery order is
  // rejected with the same 400 a staff cancel would get).
  const cancelled = await ordersService.cancelOrder(order._id);

  auditService.log({
    action: 'delivery.cancel',
    entity: 'Order',
    entityId: order._id,
    meta: { partner, externalId },
  });

  return { order: cancelled, cancelled: true };
}

// The single entry point the controller calls. `settings` is the full
// Setting document (so provider.verifyWebhook can read config.delivery.*).
async function handleWebhook(partner, payload, settings, req) {
  const normalizedPartner = String(partner || '').toLowerCase();
  const provider = factory.get(normalizedPartner); // throws 400 for unknown partner

  const partnerCfg = settings.delivery && settings.delivery[normalizedPartner];
  if (!partnerCfg || !partnerCfg.enabled) {
    forbidden(`Delivery partner ${normalizedPartner} is not enabled`);
  }

  const verified = provider.verifyWebhook(req, settings);
  if (!verified) unauthorized('Invalid webhook signature');

  if (payload && payload.event === 'cancelled') {
    return cancelByExternalId(normalizedPartner, payload.externalId);
  }

  const mapped = await provider.mapOrder(payload);
  return createOrGetOrder(normalizedPartner, mapped);
}

module.exports = { handleWebhook };
