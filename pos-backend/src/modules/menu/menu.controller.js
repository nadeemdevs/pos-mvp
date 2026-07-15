const MenuItem = require('./menuItem.model');
const InventoryItem = require('../inventory/inventoryItem.model');
const asyncHandler = require('../../common/utils/asyncHandler');

// Recipe lines reference InventoryItem by id — validated here (rather than
// at the schema level, since Mongoose refs aren't enforced) so a typo'd or
// deleted inventoryItemId is rejected at write time instead of silently
// producing a no-op deduction later.
async function validateRecipe(recipe) {
  if (!recipe || !recipe.length) return;

  for (const line of recipe) {
    if (!line.inventoryItemId || typeof line.qty !== 'number' || line.qty < 0) {
      const err = new Error('Each recipe line requires inventoryItemId and a non-negative qty');
      err.status = 400;
      throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    const exists = await InventoryItem.exists({ _id: line.inventoryItemId });
    if (!exists) {
      const err = new Error(`Inventory item ${line.inventoryItemId} not found`);
      err.status = 400;
      throw err;
    }
  }
}

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
  const { categoryId, name, sku, price, taxRate, active, modifiers, recipe } = req.body;
  await validateRecipe(recipe);
  const item = await MenuItem.create({ categoryId, name, sku, price, taxRate, active, modifiers, recipe });
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const { categoryId, name, sku, price, taxRate, active, modifiers, recipe } = req.body;
  await validateRecipe(recipe);
  const update = { categoryId, name, sku, price, taxRate, active };
  if (modifiers !== undefined) update.modifiers = modifiers;
  if (recipe !== undefined) update.recipe = recipe;
  const item = await MenuItem.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ message: 'Menu item not found' });
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!item) return res.status(404).json({ message: 'Menu item not found' });
  res.json({ message: 'Menu item deactivated', item });
});

module.exports = { list, getOne, create, update, remove };
