const Role = require('./role.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const roles = await Role.find().sort({ name: 1 });
  res.json(roles);
});

const getOne = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found' });
  res.json(role);
});

const create = asyncHandler(async (req, res) => {
  const { name, permissions } = req.body;
  const role = await Role.create({ name, permissions });
  res.status(201).json(role);
});

const update = asyncHandler(async (req, res) => {
  const { name, permissions } = req.body;
  const role = await Role.findByIdAndUpdate(
    req.params.id,
    { name, permissions },
    { new: true, runValidators: true }
  );
  if (!role) return res.status(404).json({ message: 'Role not found' });
  res.json(role);
});

const remove = asyncHandler(async (req, res) => {
  const role = await Role.findByIdAndDelete(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found' });
  res.json({ message: 'Role deleted' });
});

module.exports = { list, getOne, create, update, remove };
