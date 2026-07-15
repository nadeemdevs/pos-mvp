const PurchaseOrder = require('./purchaseOrder.model');
const Vendor = require('./vendor.model');
const InventoryItem = require('../inventory/inventoryItem.model');
const inventoryService = require('../inventory/inventory.service');
const poMachine = require('./po.machine');
const { nextPoNumber } = require('../../common/utils/poNumber');

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

function computeSubtotal(items) {
  return round2(items.reduce((sum, i) => sum + i.qty * i.unitCost, 0));
}

async function resolveLines(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw badRequest('items must be a non-empty array');
  }

  const lines = [];
  for (const raw of rawItems) {
    if (!raw.inventoryItemId || !raw.qty || raw.unitCost === undefined) {
      throw badRequest('Each item requires inventoryItemId, qty and unitCost');
    }
    // eslint-disable-next-line no-await-in-loop
    const inventoryItem = await InventoryItem.findById(raw.inventoryItemId);
    if (!inventoryItem) throw badRequest(`Inventory item ${raw.inventoryItemId} not found`);

    lines.push({
      inventoryItemId: inventoryItem._id,
      name: inventoryItem.name,
      unit: inventoryItem.unit,
      qty: raw.qty,
      unitCost: raw.unitCost,
      receivedQty: 0,
    });
  }
  return lines;
}

async function listPOs(query) {
  const { status, page = 1, limit = 20 } = query;
  const filter = {};
  if (status) filter.status = status;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getPO(id) {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw notFound('Purchase order not found');
  return po;
}

async function createPO(payload) {
  const { vendorId, items, expectedAt, note } = payload;
  if (!vendorId) throw badRequest('vendorId is required');

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw badRequest('Vendor not found');

  const lines = await resolveLines(items);

  const poNumber = await nextPoNumber();

  return PurchaseOrder.create({
    poNumber,
    vendorId: vendor._id,
    vendorName: vendor.name,
    status: 'DRAFT',
    items: lines,
    subtotal: computeSubtotal(lines),
    expectedAt,
    note,
  });
}

async function updatePO(id, payload) {
  const po = await getPO(id);
  if (po.status !== 'DRAFT') throw badRequest('Only DRAFT purchase orders can be edited');

  const { vendorId, items, expectedAt, note } = payload;

  if (vendorId) {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw badRequest('Vendor not found');
    po.vendorId = vendor._id;
    po.vendorName = vendor.name;
  }

  if (items) {
    po.items = await resolveLines(items);
    po.subtotal = computeSubtotal(po.items);
  }

  if (expectedAt !== undefined) po.expectedAt = expectedAt;
  if (note !== undefined) po.note = note;

  await po.save();
  return po;
}

async function placePO(id) {
  const po = await getPO(id);
  poMachine.assertTransition(po.status, 'PLACED');
  po.status = 'PLACED';
  await po.save();
  return po;
}

async function cancelPO(id) {
  const po = await getPO(id);
  poMachine.assertTransition(po.status, 'CANCELLED');
  po.status = 'CANCELLED';
  await po.save();
  return po;
}

// items: [{itemId (PO line _id), qty, unitCost?}]
async function receivePO(id, payload, user) {
  const po = await getPO(id);
  if (!['PLACED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    throw badRequest(`Cannot receive against a purchase order in status ${po.status}`);
  }

  const { items: receiveLines } = payload;
  if (!Array.isArray(receiveLines) || !receiveLines.length) {
    throw badRequest('items must be a non-empty array');
  }

  const transactions = [];

  for (const receiveLine of receiveLines) {
    const { itemId, qty, unitCost } = receiveLine;
    if (!itemId || !qty || qty <= 0) {
      throw badRequest('Each receive line requires itemId and a positive qty');
    }

    const line = po.items.find((l) => String(l._id) === String(itemId));
    if (!line) throw badRequest(`PO line ${itemId} not found`);

    const newReceivedQty = (line.receivedQty || 0) + qty;
    if (newReceivedQty > line.qty) {
      throw badRequest(
        `Cannot receive ${qty} of "${line.name}" — only ${line.qty - (line.receivedQty || 0)} remaining (ordered ${line.qty}, already received ${line.receivedQty || 0})`
      );
    }

    // eslint-disable-next-line no-await-in-loop
    const { transaction } = await inventoryService.applyStockChange({
      itemId: line.inventoryItemId,
      type: 'PURCHASE',
      qty,
      unitCost: unitCost !== undefined && unitCost !== null ? unitCost : line.unitCost,
      refType: 'PO',
      refId: po._id,
      note: `Receipt against ${po.poNumber}`,
      user,
    });
    transactions.push(transaction);

    line.receivedQty = newReceivedQty;
  }

  const allFullyReceived = po.items.every((l) => l.receivedQty >= l.qty);
  const nextStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  poMachine.assertTransition(po.status, nextStatus);
  po.status = nextStatus;

  await po.save();
  return { po, transactions };
}

module.exports = { listPOs, getPO, createPO, updatePO, placePO, cancelPO, receivePO };
