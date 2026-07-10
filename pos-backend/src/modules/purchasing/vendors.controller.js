const Vendor = require('./vendor.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { search, active } = req.query;
  const filter = {};
  if (search) filter.name = { $regex: search, $options: 'i' };
  if (active !== undefined) filter.active = active === 'true';

  const vendors = await Vendor.find(filter).sort({ name: 1 });
  res.json(vendors);
});

const getOne = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
  res.json(vendor);
});

const create = asyncHandler(async (req, res) => {
  const { name, phone, email, gstin, address, active } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const vendor = await Vendor.create({ name, phone, email, gstin, address, active });
  res.status(201).json(vendor);
});

const update = asyncHandler(async (req, res) => {
  const { name, phone, email, gstin, address, active } = req.body;
  const update = { name, phone, email, gstin, address, active };
  const vendor = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
  res.json(vendor);
});

const remove = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
  res.json({ message: 'Vendor deactivated', vendor });
});

module.exports = { list, getOne, create, update, remove };
