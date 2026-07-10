const InventoryItem = require('./inventoryItem.model');
const StockTransaction = require('./stockTransaction.model');
const { publish } = require('../../common/eventBus');

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

async function listItems(query) {
  const { search, low, page = 1, limit = 20 } = query;
  const filter = { active: true };

  if (search) filter.name = { $regex: search, $options: 'i' };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  if (low === 'true' || low === true) {
    // $expr lets us compare two fields of the same document.
    filter.$expr = { $lt: ['$currentStock', '$minStock'] };
  }

  const [items, total] = await Promise.all([
    InventoryItem.find(filter)
      .sort({ name: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    InventoryItem.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function lowStockItems() {
  return InventoryItem.find({ active: true, $expr: { $lt: ['$currentStock', '$minStock'] } }).sort({ name: 1 });
}

async function getItem(id) {
  const item = await InventoryItem.findById(id);
  if (!item) throw notFound('Inventory item not found');
  return item;
}

async function createItem(payload) {
  const { name, sku, unit, category, currentStock, minStock, avgCost, active } = payload;
  if (!name) throw badRequest('name is required');
  if (!unit) throw badRequest('unit is required');

  return InventoryItem.create({
    name,
    sku,
    unit,
    category,
    currentStock: currentStock || 0,
    minStock: minStock || 0,
    avgCost: avgCost || 0,
    active: active === undefined ? true : active,
  });
}

async function updateItem(id, payload) {
  const item = await getItem(id);
  const { name, sku, unit, category, minStock, active } = payload;

  if (name !== undefined) item.name = name;
  if (sku !== undefined) item.sku = sku;
  if (unit !== undefined) item.unit = unit;
  if (category !== undefined) item.category = category;
  if (minStock !== undefined) item.minStock = minStock;
  if (active !== undefined) item.active = active;

  await item.save();
  return item;
}

async function deactivateItem(id) {
  const item = await getItem(id);
  item.active = false;
  await item.save();
  return item;
}

// Core stock-mutation primitive — every stock movement in the app (manual
// adjustment/wastage, PO receiving, automatic recipe deduction) goes through
// here so currentStock, the transaction ledger, avgCost, and the
// inventory.updated/stock.low events always stay in lock-step.
//
// Not a true multi-document transaction (no new deps, and Mongo standalone
// deployments here don't run a replica set) — the read-then-write has a
// small race window under heavy concurrent writers on the SAME item, which
// is an acceptable tradeoff for this phase.
async function applyStockChange({ itemId, type, qty, unitCost, refType, refId, note, user }) {
  if (!itemId) throw badRequest('itemId is required');
  if (typeof qty !== 'number' || qty === 0) throw badRequest('qty must be a non-zero number');

  const item = await InventoryItem.findById(itemId);
  if (!item) throw notFound('Inventory item not found');

  const oldStock = item.currentStock || 0;
  const oldAvg = item.avgCost || 0;

  const update = { $inc: { currentStock: qty } };

  if (type === 'PURCHASE' && unitCost !== undefined && unitCost !== null) {
    const baseStock = Math.max(oldStock, 0);
    const newTotalQty = baseStock + qty;
    const newAvg = newTotalQty > 0 ? round2((baseStock * oldAvg + qty * unitCost) / newTotalQty) : oldAvg;
    update.$set = { avgCost: newAvg };
  }

  const updated = await InventoryItem.findByIdAndUpdate(itemId, update, { new: true });

  const transaction = await StockTransaction.create({
    inventoryItemId: itemId,
    type,
    qty,
    unitCost,
    refType,
    refId,
    note,
    balanceAfter: updated.currentStock,
    by: user ? { id: user.id, name: user.name } : undefined,
    tenantId: updated.tenantId,
    branchId: updated.branchId,
  });

  publish('inventory.updated', {
    inventoryItemId: updated._id,
    branchId: updated.branchId,
    currentStock: updated.currentStock,
  });

  if (updated.currentStock < updated.minStock) {
    publish('stock.low', {
      inventoryItemId: updated._id,
      name: updated.name,
      currentStock: updated.currentStock,
      minStock: updated.minStock,
      branchId: updated.branchId,
    });
  }

  return { item: updated, transaction };
}

async function adjustStock(itemId, payload, user) {
  const { qty, type, note } = payload;
  if (typeof qty !== 'number' || qty === 0) throw badRequest('qty must be a non-zero number');
  if (!['ADJUSTMENT', 'WASTAGE'].includes(type)) {
    throw badRequest("type must be 'ADJUSTMENT' or 'WASTAGE'");
  }

  return applyStockChange({ itemId, type, qty, refType: 'MANUAL', refId: itemId, note, user });
}

async function getLedger(itemId, query) {
  const { page = 1, limit = 20 } = query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const filter = { inventoryItemId: itemId };

  const [items, total] = await Promise.all([
    StockTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    StockTransaction.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

module.exports = {
  listItems,
  lowStockItems,
  getItem,
  createItem,
  updateItem,
  deactivateItem,
  applyStockChange,
  adjustStock,
  getLedger,
};
