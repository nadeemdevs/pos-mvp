const MenuItem = require('./menuItem.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { category, search, active } = req.query;
  const filter = {};

  if (category) filter.categoryId = category;
  if (active !== undefined) filter.active = active === 'true';
  if (search) filter.name = { $regex: search, $options: 'i' };

  const items = await MenuItem.find(filter).populate('categoryId', 'name').sort({ name: 1 });
  res.json(items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await MenuItem.findById(req.params.id).populate('categoryId', 'name');
  if (!item) return res.status(404).json({ message: 'Menu item not found' });
  res.json(item);
});

const create = asyncHandler(async (req, res) => {
  const { categoryId, name, sku, price, taxRate, active } = req.body;
  const item = await MenuItem.create({ categoryId, name, sku, price, taxRate, active });
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const { categoryId, name, sku, price, taxRate, active } = req.body;
  const item = await MenuItem.findByIdAndUpdate(
    req.params.id,
    { categoryId, name, sku, price, taxRate, active },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ message: 'Menu item not found' });
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!item) return res.status(404).json({ message: 'Menu item not found' });
  res.json({ message: 'Menu item deactivated', item });
});

module.exports = { list, getOne, create, update, remove };
