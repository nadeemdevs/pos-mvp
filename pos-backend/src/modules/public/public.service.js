const crypto = require('crypto');
const Table = require('../tables/table.model');
const Order = require('../orders/order.model');
const Kot = require('../kots/kot.model');
const Category = require('../menu/category.model');
const MenuItem = require('../menu/menuItem.model');
const Setting = require('../settings/setting.model');
const customersService = require('../customers/customers.service');
const ordersService = require('../orders/orders.service');
const { nextOrderNumber } = require('../../common/utils/orderNumber');
const { emitTo } = require('../../sockets');
const eventBus = require('../../common/eventBus');
const auditService = require('../audit/audit.service');

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

function unauthorized(message) {
  const err = new Error(message);
  err.status = 401;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

async function isOnlineOrderingEnabled() {
  const settings = await getSettings();
  return !!(settings.features && settings.features.onlineOrdering);
}

// "Active categories + active menu items" — Category has no `active` field of
// its own (deliberate: it's used across every other module too), so a
// category is considered "active" here for public-menu purposes when it has
// at least one active menu item. Only the fields a guest needs are exposed —
// no recipe/cost data ever leaves this endpoint.
async function getPublicMenu() {
  const items = await MenuItem.find({ active: true })
    .select('name price taxRate modifiers categoryId')
    .sort({ name: 1 })
    .lean();

  const categoryIds = [...new Set(items.map((i) => String(i.categoryId)))];
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } })
        .sort({ sortOrder: 1, name: 1 })
        .lean()
    : [];

  const itemsByCategory = new Map();
  for (const item of items) {
    const key = String(item.categoryId);
    if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
    itemsByCategory.get(key).push({
      _id: item._id,
      name: item.name,
      price: item.price,
      taxRate: item.taxRate,
      modifiers: item.modifiers || [],
      categoryId: item.categoryId,
    });
  }

  return categories.map((cat) => ({
    _id: cat._id,
    name: cat.name,
    sortOrder: cat.sortOrder,
    items: itemsByCategory.get(String(cat._id)) || [],
  }));
}

async function getTableByToken(qrToken) {
  const table = await Table.findOne({ qrToken });
  if (!table) throw notFound('Table not found');
  return { tableName: table.name, status: table.status };
}

function orderSummaryForPublic(order) {
  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    statusToken: order.publicToken,
  };
}

// POST /api/public/orders — the one public write endpoint. Every price and
// modifier is resolved server-side via ordersService.priceRequestedItems
// (the exact same helper the staff-facing POST /api/orders/:id/items uses),
// so a guest's phone can never dictate what they're charged.
async function createPublicOrder(payload) {
  const { qrToken, customer, items = [] } = payload;

  if (!qrToken) throw badRequest('qrToken is required');
  if (!customer || !customer.phone) throw badRequest('customer.phone is required');
  if (!items.length) throw badRequest('items must be a non-empty array');

  const table = await Table.findOne({ qrToken });
  if (!table) throw notFound('Table not found');

  const lines = await ordersService.priceRequestedItems(items);

  const customerDoc = await customersService.upsertByPhone(customer);

  if (table.status === 'FREE') {
    const orderNumber = await nextOrderNumber();
    const publicToken = crypto.randomBytes(20).toString('hex');
    const { subtotal, tax, total } = ordersService.computeOrderTotals(lines);

    const order = await Order.create({
      orderNumber,
      type: 'DINE_IN',
      channel: 'QR',
      tableId: table._id,
      tableName: table.name,
      guestCount: 2,
      waiter: { name: 'QR Guest' },
      customer: { name: customer.name, phone: customer.phone },
      customerId: customerDoc ? customerDoc._id : undefined,
      publicToken,
      items: lines,
      status: 'OPEN',
      subtotal,
      tax,
      total,
    });

    table.status = 'OCCUPIED';
    table.currentOrderId = order._id;
    await table.save();

    emitTo('floor', 'table.updated', ordersService.tableSummary(table));
    emitTo('floor', 'order.created', ordersService.orderSummary(order));
    eventBus.publish('order.created', { order });

    auditService.log({
      action: 'public.order',
      entity: 'Order',
      entityId: order._id,
      meta: { channel: 'QR', tableId: table._id, orderNumber },
    });

    return orderSummaryForPublic(order);
  }

  if (table.status === 'OCCUPIED' && table.currentOrderId) {
    const order = await Order.findById(table.currentOrderId);
    if (!order || order.status !== 'OPEN') {
      throw conflict('Table is billing — please ask staff');
    }

    // Append as unfired lines onto the existing order — staff still fire
    // KOTs from the floor/KDS exactly as before; the QR channel never fires
    // its own KOTs.
    for (const line of lines) {
      order.items.push(line);
    }
    ordersService.applyTotals(order);

    if (!order.publicToken) order.publicToken = crypto.randomBytes(20).toString('hex');
    if (!order.customerId && customerDoc) order.customerId = customerDoc._id;
    if (!order.customer || !order.customer.phone) {
      order.customer = { name: customer.name, phone: customer.phone };
    }

    await order.save();

    emitTo('floor', 'order.updated', ordersService.orderSummary(order));
    eventBus.publish('order.updated', { order });

    auditService.log({
      action: 'public.order',
      entity: 'Order',
      entityId: order._id,
      meta: { channel: 'QR', tableId: table._id, appended: true },
    });

    return orderSummaryForPublic(order);
  }

  // BILLED, or OCCUPIED with no linked/open order — guest can't self-order.
  throw conflict('Table is billing — please ask staff');
}

async function getOrderStatus(orderId, token) {
  if (!token) throw unauthorized('A status token is required');

  const order = await Order.findById(orderId);
  if (!order || !order.publicToken || order.publicToken !== token) {
    throw unauthorized('Invalid status token');
  }

  const kotIds = order.items.filter((i) => i.kotId).map((i) => i.kotId);
  const kots = kotIds.length ? await Kot.find({ _id: { $in: kotIds } }).select('status').lean() : [];
  const kotStatusById = new Map(kots.map((k) => [String(k._id), k.status]));

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    items: order.items.map((i) => ({
      name: i.name,
      qty: i.qty,
      kotStatus: i.kotId ? kotStatusById.get(String(i.kotId)) || 'NEW' : 'NEW',
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
  };
}

module.exports = {
  isOnlineOrderingEnabled,
  getPublicMenu,
  getTableByToken,
  createPublicOrder,
  getOrderStatus,
};
