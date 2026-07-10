const Branch = require('./branch.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const branches = await Branch.find().sort({ code: 1 });
  res.json(branches);
});

const getOne = asyncHandler(async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  res.json(branch);
});

const create = asyncHandler(async (req, res) => {
  const { code, name, address, phone, active } = req.body;
  if (!code || !name) return res.status(400).json({ message: 'code and name are required' });
  const branch = await Branch.create({ code, name, address, phone, active });
  res.status(201).json(branch);
});

const update = asyncHandler(async (req, res) => {
  const { code, name, address, phone, active } = req.body;
  const update = { code, name, address, phone, active };
  const branch = await Branch.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  res.json(branch);
});

const remove = asyncHandler(async (req, res) => {
  const branch = await Branch.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  res.json({ message: 'Branch deactivated', branch });
});

module.exports = { list, getOne, create, update, remove };
