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

// 'all' is a reserved sentinel used by the "All Branches" combined view
// (see tenantContext.js) — never a real branch code.
function isReservedCode(code) {
  return typeof code === 'string' && code.trim().toLowerCase() === 'all';
}

const create = asyncHandler(async (req, res) => {
  const { code, name, address, phone, active, serviceMode } = req.body;
  if (!code || !name) return res.status(400).json({ message: 'code and name are required' });
  if (isReservedCode(code)) {
    return res.status(400).json({ message: "'all' is reserved and cannot be used as a branch code." });
  }
  const branch = await Branch.create({ code, name, address, phone, active, serviceMode });
  res.status(201).json(branch);
});

const update = asyncHandler(async (req, res) => {
  const { code, name, address, phone, active, serviceMode } = req.body;
  if (isReservedCode(code)) {
    return res.status(400).json({ message: "'all' is reserved and cannot be used as a branch code." });
  }
  const update = { code, name, address, phone, active, serviceMode };
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
