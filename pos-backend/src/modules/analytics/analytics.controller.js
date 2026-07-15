const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./analytics.service');

const overview = asyncHandler(async (req, res) => {
  res.json(await service.overview(req.query.from, req.query.to));
});

const peakHours = asyncHandler(async (req, res) => {
  res.json(await service.peakHours(req.query.from, req.query.to));
});

const items = asyncHandler(async (req, res) => {
  res.json(await service.itemsProfitability(req.query.from, req.query.to));
});

const channels = asyncHandler(async (req, res) => {
  res.json(await service.channels(req.query.from, req.query.to));
});

const inventoryValue = asyncHandler(async (req, res) => {
  res.json(await service.inventoryValue());
});

const branches = asyncHandler(async (req, res) => {
  res.json(await service.byBranch(req.query.from, req.query.to));
});

module.exports = { overview, peakHours, items, channels, inventoryValue, branches };
