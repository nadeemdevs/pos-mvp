const test = require('node:test');
const assert = require('node:assert/strict');

const { mapOrderItemsPure } = require('./mapping');

const MENU = [
  { _id: 'm1', sku: 'VTHALI', name: 'Veg Thali', price: 120, taxRate: 5 },
  { _id: 'm2', sku: '', name: 'Chicken Biryani', price: 180, taxRate: 5 },
  { _id: 'm3', sku: 'CC01', name: 'Cold Coffee', price: 60, taxRate: 5 },
];

test('mapOrderItemsPure: matches by sku first', () => {
  const { lines, unmatched } = mapOrderItemsPure(MENU, [{ sku: 'VTHALI', name: 'Something Else', qty: 2 }]);
  assert.equal(unmatched.length, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].menuItemId, 'm1');
  assert.equal(lines[0].name, 'Veg Thali');
  assert.equal(lines[0].price, 120);
  assert.equal(lines[0].qty, 2);
});

test('mapOrderItemsPure: falls back to case-insensitive exact name match', () => {
  const { lines, unmatched } = mapOrderItemsPure(MENU, [{ name: 'chicken biryani', qty: 1 }]);
  assert.equal(unmatched.length, 0);
  assert.equal(lines[0].menuItemId, 'm2');
});

test('mapOrderItemsPure: unmatched items are listed, not silently dropped', () => {
  const { lines, unmatched } = mapOrderItemsPure(MENU, [
    { sku: 'VTHALI', qty: 1 },
    { name: 'Mystery Item', qty: 1 },
    { sku: 'NOPE', name: 'Also Missing', qty: 1 },
  ]);
  assert.equal(lines.length, 1);
  assert.deepEqual(unmatched, ['Mystery Item', 'Also Missing (sku: NOPE)']);
});

test('mapOrderItemsPure: never trusts a partner-supplied price — always uses the menu price', () => {
  const { lines } = mapOrderItemsPure(MENU, [{ sku: 'CC01', name: 'Cold Coffee', qty: 3, price: 1 }]);
  assert.equal(lines[0].price, 60);
  assert.equal(lines[0].qty, 3);
});

test('mapOrderItemsPure: qty defaults to 1 when omitted', () => {
  const { lines } = mapOrderItemsPure(MENU, [{ sku: 'VTHALI' }]);
  assert.equal(lines[0].qty, 1);
});
