const Category = require('./category.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
  res.json(categories);
});

const create = asyncHandler(async (req, res) => {
  const { name, sortOrder } = req.body;
  const category = await Category.create({ name, sortOrder });
  res.status(201).json(category);
});

const update = asyncHandler(async (req, res) => {
  const { name, sortOrder } = req.body;
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { name, sortOrder },
    { new: true, runValidators: true }
  );
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json(category);
});

const remove = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json({ message: 'Category deleted' });
});

module.exports = { list, create, update, remove };
