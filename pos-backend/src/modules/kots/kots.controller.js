const asyncHandler = require('../../common/utils/asyncHandler');
const service = require('./kots.service');

const list = asyncHandler(async (req, res) => {
  const kots = await service.listKots(req.query);
  res.json(kots);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'status is required' });
  const kot = await service.updateStatus(req.params.id, status);
  res.json(kot);
});

const print = asyncHandler(async (req, res) => {
  const result = await service.printKot(req.params.id);
  res.json(result);
});

module.exports = { list, updateStatus, print };
