const Order = require('./order.model');
const Table = require('../tables/table.model');
const Kot = require('../kots/kot.model');
const Invoice = require('../billing/invoice.model');
const MenuItem = require('../menu/menuItem.model');
const billingService = require('../billing/billing.service');
const orderMachine = require('./order.machine');
const { splitByItems, splitEqually } = require('./split');
const { nextOrderNumber } = require('../../common/utils/orderNumber');
const { nextKotNumber } = require('../../common/utils/kotNumber');
const { emitTo } = require('../../sockets');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// order.items line total = (price + sum(modifier prices)) * qty; tax per
// item taxRate; everything rounded to 2dp — recomputed on every mutation.
function computeOrderTotals(items = []) {
  let subtotal = 0;
  let tax = 0;

  for (const item of items) {
    const modifierTotal = (item.modifiers || []).reduce((sum, m) => sum + (m.price || 0), 0);
    const lineAmount = (item.price + modifierTotal) * item.qty;
    const lineTax = (lineAmount * (item.taxRate || 0)) / 100;
    subtotal += lineAmount;
    tax += lineTax;
  }

  const subtotalR = round2(subtotal);
  const taxR = round2(tax);
  return { subtotal: subtotalR, tax: taxR, total: round2(subtotalR + taxR) };
}

function applyTotals(order) {
  const { subtotal, tax, total } = computeOrderTotals(order.items);
  order.subtotal = subtotal;
  order.tax = tax;
  order.total = total;
}

function tableSummary(table) {
  return {
    _id: table._id,
    name: table.name,
    zone: table.zone,
    status: table.status,
    currentOrderId: table.currentOrderId,
  };
}

function orderSummary(order) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    tableName: order.tableName,
    status: order.status,
    itemCount: order.items.length,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
  };
}

async function createOrder(payload, user) {
  const { tableId, guestCount = 1, type = 'DINE_IN' } = payload;

  let table = null;
  if (type === 'DINE_IN') {
    if (!tableId) throw badRequest('tableId is required for DINE_IN orders');
    table = await Table.findById(tableId);
    if (!table) throw notFound('Table not found');
    if (table.status !== 'FREE') {
      const err = new Error('Table is not free');
      err.status = 409;
      throw err;
    }
  }

  const orderNumber = await nextOrderNumber();

  const order = await Order.create({
    orderNumber,
    type,
    tableId: table ? table._id : undefined,
    tableName: table ? table.name : undefined,
    guestCount,
    waiter: { id: user.id, name: user.name },
    items: [],
    status: 'OPEN',
    subtotal: 0,
    tax: 0,
    total: 0,
  });

  if (table) {
    table.status = 'OCCUPIED';
    table.currentOrderId = order._id;
    await table.save();
    emitTo('floor', 'table.updated', tableSummary(table));
  }

  emitTo('floor', 'order.created', orderSummary(order));

  return order;
}

async function listOrders(query) {
  const { status, tableId, active, page = 1, limit = 20 } = query;
  const filter = {};

  if (status) filter.status = status;
  if (tableId) filter.tableId = tableId;
  if (active === 'true' || active === true) {
    filter.status = { $nin: ['PAID', 'CLOSED', 'CANCELLED'] };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Order.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getOrder(id) {
  const order = await Order.findById(id);
  if (!order) throw notFound('Order not found');
  return order;
}

// Modifiers are validated against the menu item's own defined modifiers by
// name — price always comes from the menu definition, never the client.
function resolveModifiers(menuItem, requestedModifiers = []) {
  return requestedModifiers.map((requested) => {
    const defined = (menuItem.modifiers || []).find((m) => m.name === requested.name);
    if (!defined) {
      throw badRequest(`Unknown modifier "${requested.name}" for item "${menuItem.name}"`);
    }
    return { name: defined.name, price: defined.price || 0 };
  });
}

async function addItems(orderId, payload, user) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');
  if (order.status !== 'OPEN') throw badRequest('Items can only be added while the order is OPEN');

  const { items = [] } = payload;
  if (!items.length) throw badRequest('items must be a non-empty array');

  for (const requested of items) {
    const menuItem = await MenuItem.findById(requested.menuItemId);
    if (!menuItem || !menuItem.active) {
      throw badRequest(`Menu item ${requested.menuItemId} not found or inactive`);
    }

    const modifiers = resolveModifiers(menuItem, requested.modifiers || []);
    const note = requested.note || '';

    // Merge plain repeats into the existing unfired line — otherwise two rapid
    // taps on a menu tile race each other into duplicate one-qty lines.
    const mergeable =
      !modifiers.length &&
      !note &&
      order.items.find(
        (i) =>
          !i.kotId && String(i.menuItemId) === String(menuItem._id) && !i.modifiers.length && !i.note
      );

    if (mergeable) {
      mergeable.qty += requested.qty || 1;
    } else {
      order.items.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        taxRate: menuItem.taxRate || 0,
        qty: requested.qty || 1,
        modifiers,
        note,
        kotId: null,
      });
    }
  }

  applyTotals(order);
  await order.save();

  emitTo('floor', 'order.updated', orderSummary(order));
  return order;
}

function findUnfiredItem(order, itemId) {
  const item = order.items.find((i) => String(i._id) === String(itemId));
  if (!item) throw notFound('Order item not found');
  if (order.status !== 'OPEN') throw badRequest('Items can only be edited while the order is OPEN');
  if (item.kotId) throw badRequest('Cannot modify an item that has already been fired to the kitchen');
  return item;
}

async function updateItem(orderId, itemId, payload) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  const item = findUnfiredItem(order, itemId);
  if (payload.qty !== undefined) {
    if (!(payload.qty > 0)) throw badRequest('qty must be a positive number');
    item.qty = payload.qty;
  }

  applyTotals(order);
  await order.save();

  emitTo('floor', 'order.updated', orderSummary(order));
  return order;
}

async function removeItem(orderId, itemId) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  findUnfiredItem(order, itemId);
  order.items = order.items.filter((i) => String(i._id) !== String(itemId));

  applyTotals(order);
  await order.save();

  emitTo('floor', 'order.updated', orderSummary(order));
  return order;
}

async function fireKot(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  const unfired = order.items.filter((i) => !i.kotId);
  if (!unfired.length) throw badRequest('No unfired items');

  const kotNumber = await nextKotNumber();

  const kot = await Kot.create({
    kotNumber,
    orderId: order._id,
    orderNumber: order.orderNumber,
    tableId: order.tableId,
    tableName: order.tableName,
    items: unfired.map((i) => ({
      name: i.name,
      qty: i.qty,
      modifiers: (i.modifiers || []).map((m) => ({ name: m.name })),
      note: i.note || '',
    })),
    status: 'NEW',
  });

  for (const item of unfired) {
    item.kotId = kot._id;
  }
  await order.save();

  emitTo('kitchen', 'kot.created', kot);
  emitTo('floor', 'kot.created', kot);
  emitTo('floor', 'order.updated', orderSummary(order));

  return kot;
}

async function requestBill(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  orderMachine.assertTransition(order.status, 'BILL_REQUESTED');

  const hasUnfired = order.items.some((i) => !i.kotId);
  if (hasUnfired) throw badRequest('Fire or remove unfired items before requesting the bill');

  order.status = 'BILL_REQUESTED';
  await order.save();

  emitTo('floor', 'order.updated', orderSummary(order));

  if (order.tableId) {
    const table = await Table.findById(order.tableId);
    if (table) {
      table.status = 'BILLED';
      await table.save();
      emitTo('floor', 'table.updated', tableSummary(table));
    }
  }

  return order;
}

async function billOrder(orderId, payload, user) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  orderMachine.assertTransition(order.status, 'INVOICED');

  const hasUnfired = order.items.some((i) => !i.kotId);
  if (hasUnfired) throw badRequest('Fire or remove unfired items before billing');

  const mode = (payload.mode || 'FULL').toUpperCase();
  let itemGroups; // array of arrays of order-item-shaped objects

  if (mode === 'FULL') {
    if (!order.items.length) throw badRequest('Order has no items to bill');
    itemGroups = [order.items];
  } else if (mode === 'ITEMS') {
    itemGroups = splitByItems(order.items, payload.splits);
  } else if (mode === 'EQUAL') {
    itemGroups = splitEqually(order, payload.ways);
  } else {
    throw badRequest(`Unsupported bill mode: ${mode}`);
  }

  const label =
    mode === 'FULL' ? undefined : mode === 'ITEMS' ? `Split bill — ${order.orderNumber}` : undefined;

  const invoices = [];
  for (const group of itemGroups) {
    // eslint-disable-next-line no-await-in-loop
    const invoice = await billingService.createFromOrder(order, group, { label, cashier: user });
    invoices.push(invoice);
  }

  order.invoiceIds.push(...invoices.map((inv) => inv._id));
  order.status = 'INVOICED';
  await order.save();

  for (const invoice of invoices) {
    emitTo('floor', 'invoice.created', {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      orderId: order._id,
      total: invoice.total,
    });
  }
  emitTo('floor', 'order.updated', orderSummary(order));

  return { order, invoices };
}

async function cancelOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw notFound('Order not found');

  if (order.invoiceIds && order.invoiceIds.length) {
    throw badRequest('Cannot cancel an order that already has invoices');
  }

  orderMachine.assertTransition(order.status, 'CANCELLED');

  const kots = await Kot.find({ orderId: order._id, status: { $nin: ['SERVED', 'CANCELLED'] } });
  for (const kot of kots) {
    kot.status = 'CANCELLED';
    kot.statusTimeline.push({ status: 'CANCELLED', at: new Date() });
    // eslint-disable-next-line no-await-in-loop
    await kot.save();
    emitTo('kitchen', 'kot.updated', kot);
    emitTo('floor', 'kot.updated', kot);
  }

  order.status = 'CANCELLED';
  await order.save();

  if (order.tableId) {
    const table = await Table.findById(order.tableId);
    if (table) {
      table.status = 'FREE';
      table.currentOrderId = null;
      await table.save();
      emitTo('floor', 'table.updated', tableSummary(table));
    }
  }

  emitTo('floor', 'order.closed', { orderId: order._id, orderNumber: order.orderNumber, status: 'CANCELLED' });

  return order;
}

// Shared settlement hook — called from BOTH the manual-payments controller
// and payments.service.applyStatus (card terminal / callback path) right
// after an invoice is marked PAID. Mode 1 invoices (no orderId) are a no-op.
// Once every invoice tied to the order is PAID, the order is moved straight
// to CLOSED (single save; FSM validated as INVOICED->PAID->CLOSED) and its
// table is freed.
async function settleInvoicePaid(invoice) {
  if (!invoice || !invoice.orderId) return null;

  const order = await Order.findById(invoice.orderId);
  if (!order) return null;

  if (order.status === 'CLOSED' || order.status === 'CANCELLED') {
    // Already settled/cancelled — idempotent no-op (e.g. duplicate callback).
    return order;
  }

  const invoices = order.invoiceIds.length ? await Invoice.find({ _id: { $in: order.invoiceIds } }) : [];
  const allPaid = invoices.length > 0 && invoices.every((inv) => inv.paymentStatus === 'PAID');
  if (!allPaid) return order;

  orderMachine.assertTransition(order.status, 'PAID');
  orderMachine.assertTransition('PAID', 'CLOSED');

  order.status = 'CLOSED';
  order.paidAt = new Date();
  await order.save();

  if (order.tableId) {
    const table = await Table.findById(order.tableId);
    if (table) {
      table.status = 'FREE';
      table.currentOrderId = null;
      await table.save();
      emitTo('floor', 'table.updated', tableSummary(table));
    }
  }

  emitTo('floor', 'payment.completed', { invoiceId: invoice._id, orderId: order._id });
  emitTo('floor', 'order.closed', { orderId: order._id, orderNumber: order.orderNumber, status: 'CLOSED' });

  return order;
}

module.exports = {
  computeOrderTotals,
  createOrder,
  listOrders,
  getOrder,
  addItems,
  updateItem,
  removeItem,
  fireKot,
  requestBill,
  billOrder,
  cancelOrder,
  settleInvoicePaid,
  orderSummary,
  tableSummary,
};
