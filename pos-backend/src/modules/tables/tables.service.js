const Table = require('./table.model');
const Order = require('../orders/order.model');
const Kot = require('../kots/kot.model');
const { computeOrderTotals } = require('../orders/orders.service');
const { emitTo } = require('../../sockets');

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

function tableSummary(table) {
  return {
    _id: table._id,
    name: table.name,
    zone: table.zone,
    capacity: table.capacity,
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

async function listTables() {
  const tables = await Table.find().sort({ zone: 1, name: 1 }).lean();

  const orderIds = tables.filter((t) => t.currentOrderId).map((t) => t.currentOrderId);
  const orders = orderIds.length ? await Order.find({ _id: { $in: orderIds } }).lean() : [];
  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  return tables.map((table) => {
    const result = { ...table };
    const order = table.currentOrderId ? orderById.get(String(table.currentOrderId)) : null;

    if (order) {
      result.order = {
        _id: order._id,
        orderNumber: order.orderNumber,
        guestCount: order.guestCount,
        status: order.status,
        itemCount: order.items.length,
        total: order.total,
      };
    }

    return result;
  });
}

async function createTable(payload) {
  const { name, zone, capacity } = payload;
  if (!name) throw badRequest('name is required');
  return Table.create({ name, zone, capacity });
}

async function updateTable(id, payload) {
  const table = await Table.findById(id);
  if (!table) throw notFound('Table not found');
  if (table.status !== 'FREE') throw badRequest('Cannot edit a table that is not FREE');

  const { name, zone, capacity } = payload;
  if (name !== undefined) table.name = name;
  if (zone !== undefined) table.zone = zone;
  if (capacity !== undefined) table.capacity = capacity;

  await table.save();
  return table;
}

async function deleteTable(id) {
  const table = await Table.findById(id);
  if (!table) throw notFound('Table not found');
  if (table.status !== 'FREE') throw badRequest('Cannot delete a table that is not FREE');

  await Table.findByIdAndDelete(id);
  return table;
}

async function transferTable(sourceId, toTableId) {
  if (!toTableId) throw badRequest('toTableId is required');

  const source = await Table.findById(sourceId);
  const target = await Table.findById(toTableId);
  if (!source) throw notFound('Source table not found');
  if (!target) throw notFound('Target table not found');

  if (source.status === 'FREE') throw badRequest('Source table is free — nothing to transfer');
  if (target.status !== 'FREE') throw badRequest('Target table is not free');

  const order = await Order.findById(source.currentOrderId);
  if (!order) throw notFound('Order for source table not found');

  order.tableId = target._id;
  order.tableName = target.name;
  await order.save();

  target.status = source.status;
  target.currentOrderId = source.currentOrderId;
  await target.save();

  source.status = 'FREE';
  source.currentOrderId = null;
  await source.save();

  emitTo('floor', 'table.updated', tableSummary(source));
  emitTo('floor', 'table.updated', tableSummary(target));
  emitTo('floor', 'order.updated', orderSummary(order));

  return { source, target, order };
}

// Appends fromTable's order items (fired and unfired, preserving kotId refs)
// into the destination table's (id) order, then cancels the source order.
async function mergeTables(intoTableId, fromTableId) {
  if (!fromTableId) throw badRequest('fromTableId is required');

  const destTable = await Table.findById(intoTableId);
  const srcTable = await Table.findById(fromTableId);
  if (!destTable) throw notFound('Destination table not found');
  if (!srcTable) throw notFound('Source table not found');

  if (destTable.status !== 'OCCUPIED' || srcTable.status !== 'OCCUPIED') {
    throw badRequest('Both tables must be occupied to merge');
  }

  const destOrder = await Order.findById(destTable.currentOrderId);
  const srcOrder = await Order.findById(srcTable.currentOrderId);
  if (!destOrder || !srcOrder) throw notFound('Order not found for one of the tables');

  if (destOrder.status !== 'OPEN' || srcOrder.status !== 'OPEN') {
    throw badRequest('Both tables must have OPEN orders to merge');
  }

  const movedKotIds = [];

  for (const item of srcOrder.items) {
    destOrder.items.push({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      taxRate: item.taxRate,
      qty: item.qty,
      modifiers: item.modifiers,
      note: item.note,
      kotId: item.kotId, // preserved — same KOT ticket, now repointed below
    });
    if (item.kotId) movedKotIds.push(item.kotId);
  }

  const { subtotal, tax, total } = computeOrderTotals(destOrder.items);
  destOrder.subtotal = subtotal;
  destOrder.tax = tax;
  destOrder.total = total;
  await destOrder.save();

  // Any KOTs already fired for the merged-away items still exist as their
  // own tickets (items array untouched) — but their parent-order pointer
  // must follow the items to the destination order, otherwise kitchen
  // lookups and order.cancel's "cancel this order's KOTs" query would keep
  // referencing the now-cancelled source order.
  if (movedKotIds.length) {
    await Kot.updateMany(
      { _id: { $in: movedKotIds } },
      { $set: { orderId: destOrder._id, orderNumber: destOrder.orderNumber, tableId: destTable._id, tableName: destTable.name } }
    );
  }

  srcOrder.status = 'CANCELLED';
  srcOrder.note = `Merged into ${destOrder.orderNumber}`;
  await srcOrder.save();

  srcTable.status = 'FREE';
  srcTable.currentOrderId = null;
  await srcTable.save();

  emitTo('floor', 'table.updated', tableSummary(destTable));
  emitTo('floor', 'table.updated', tableSummary(srcTable));
  emitTo('floor', 'order.updated', orderSummary(destOrder));
  emitTo('floor', 'order.updated', orderSummary(srcOrder));

  return { destTable, srcTable, destOrder, srcOrder };
}

module.exports = { listTables, createTable, updateTable, deleteTable, transferTable, mergeTables };
