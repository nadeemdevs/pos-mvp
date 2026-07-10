const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./orders.service');

const create = asyncHandler(async (req, res) => {
  const order = await service.createOrder(req.body, req.user);
  res.status(201).json(order);
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listOrders(req.query);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const order = await service.getOrder(req.params.id);
  res.json(order);
});

const addItems = asyncHandler(async (req, res) => {
  const order = await service.addItems(req.params.id, req.body, req.user);
  res.json(order);
});

const updateItem = asyncHandler(async (req, res) => {
  const order = await service.updateItem(req.params.id, req.params.itemId, req.body);
  res.json(order);
});

const removeItem = asyncHandler(async (req, res) => {
  const order = await service.removeItem(req.params.id, req.params.itemId);
  res.json(order);
});

const fireKot = asyncHandler(async (req, res) => {
  const kot = await service.fireKot(req.params.id);
  res.status(201).json({ kot });
});

const requestBill = asyncHandler(async (req, res) => {
  const order = await service.requestBill(req.params.id);
  res.json(order);
});

const bill = asyncHandler(async (req, res) => {
  const result = await service.billOrder(req.params.id, req.body, req.user);
  res.json(result);
});

const cancel = asyncHandler(async (req, res) => {
  const order = await service.cancelOrder(req.params.id);
  res.json(order);
});

module.exports = { create, list, getOne, addItems, updateItem, removeItem, fireKot, requestBill, bill, cancel };
