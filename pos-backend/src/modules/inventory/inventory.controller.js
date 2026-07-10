const asyncHandler = require('../../common/utils/asyncHandler');
const inventoryService = require('./inventory.service');
const auditService = require('../audit/audit.service');

const list = asyncHandler(async (req, res) => {
  const result = await inventoryService.listItems(req.query);
  res.json(result);
});

const low = asyncHandler(async (req, res) => {
  const items = await inventoryService.lowStockItems();
  res.json(items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await inventoryService.getItem(req.params.id);
  res.json(item);
});

const create = asyncHandler(async (req, res) => {
  const item = await inventoryService.createItem(req.body);
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await inventoryService.updateItem(req.params.id, req.body);
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await inventoryService.deactivateItem(req.params.id);
  res.json({ message: 'Inventory item deactivated', item });
});

const adjust = asyncHandler(async (req, res) => {
  const { item, transaction } = await inventoryService.adjustStock(req.params.id, req.body, req.user);

  auditService.log({
    req,
    action: 'stock.adjust',
    entity: 'InventoryItem',
    entityId: item._id,
    meta: { qty: req.body.qty, type: req.body.type, note: req.body.note, balanceAfter: transaction.balanceAfter },
  });

  res.json({ item, transaction });
});

const ledger = asyncHandler(async (req, res) => {
  const result = await inventoryService.getLedger(req.params.id, req.query);
  res.json(result);
});

module.exports = { list, low, getOne, create, update, remove, adjust, ledger };
