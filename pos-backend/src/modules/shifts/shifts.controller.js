const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./shifts.service');

const open = asyncHandler(async (req, res) => {
  const shift = await service.openShift(req.body, req.user, req.branchId);
  res.status(201).json(shift);
});

const current = asyncHandler(async (req, res) => {
  const result = await service.getCurrentShift(req.branchId);
  res.json(result);
});

const movement = asyncHandler(async (req, res) => {
  const shift = await service.addMovement(req.params.id, req.body, req.user);
  res.json(shift);
});

const close = asyncHandler(async (req, res) => {
  const shift = await service.closeShift(req.params.id, req.body, req.user);
  res.json(shift);
});

const list = asyncHandler(async (req, res) => {
  const result = await service.listShifts(req.query, req.branchId);
  res.json(result);
});

const getOne = asyncHandler(async (req, res) => {
  const result = await service.getShift(req.params.id);
  res.json(result);
});

module.exports = { open, current, movement, close, list, getOne };
