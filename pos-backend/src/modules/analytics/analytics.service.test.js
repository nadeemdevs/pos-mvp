const test = require('node:test');
const assert = require('node:assert/strict');

const { foodCostForLine } = require('./analytics.service');

test('foodCostForLine: no menu item contributes 0', () => {
  assert.equal(foodCostForLine(null, 3, new Map()), 0);
  assert.equal(foodCostForLine(undefined, 3, new Map()), 0);
});

test('foodCostForLine: menu item with no recipe contributes 0', () => {
  const menuItem = { recipe: [] };
  assert.equal(foodCostForLine(menuItem, 5, new Map()), 0);
});

test('foodCostForLine: single-ingredient recipe scales with qty sold', () => {
  // Veg Thali recipe: 0.2kg rice per plate. Rice avgCost ₹40/kg.
  const inventoryItemsById = new Map([['rice1', { avgCost: 40 }]]);
  const menuItem = { recipe: [{ inventoryItemId: 'rice1', qty: 0.2 }] };

  // 3 plates sold -> 3 * 0.2 * 40 = 24
  assert.equal(foodCostForLine(menuItem, 3, inventoryItemsById), 24);
});

test('foodCostForLine: multi-ingredient recipe sums every line', () => {
  const inventoryItemsById = new Map([
    ['rice', { avgCost: 40 }],
    ['dal', { avgCost: 100 }],
  ]);
  const menuItem = {
    recipe: [
      { inventoryItemId: 'rice', qty: 0.2 }, // 0.2 * 40 = 8
      { inventoryItemId: 'dal', qty: 0.1 }, // 0.1 * 100 = 10
    ],
  };

  // 2 plates: (8 + 10) * 2 = 36
  assert.equal(foodCostForLine(menuItem, 2, inventoryItemsById), 36);
});

test('foodCostForLine: missing inventory item (deleted/bad ref) treated as avgCost 0', () => {
  const menuItem = { recipe: [{ inventoryItemId: 'ghost', qty: 1 }] };
  assert.equal(foodCostForLine(menuItem, 10, new Map()), 0);
});
