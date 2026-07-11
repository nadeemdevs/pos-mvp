const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./public.service');

const getMenu = asyncHandler(async (req, res) => {
  const menu = await service.getPublicMenu();
  res.json(menu);
});

const getTable = asyncHandler(async (req, res) => {
  const table = await service.getTableByToken(req.params.qrToken);
  res.json(table);
});

const createOrder = asyncHandler(async (req, res) => {
  const result = await service.createPublicOrder(req.body);
  res.status(201).json(result);
});

const getOrderStatus = asyncHandler(async (req, res) => {
  const status = await service.getOrderStatus(req.params.id, req.query.token);
  res.json(status);
});

module.exports = { getMenu, getTable, createOrder, getOrderStatus };
