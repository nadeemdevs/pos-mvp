const test = require('node:test');
const assert = require('node:assert/strict');

const { splitByItems, splitEqually } = require('./split');
const { computeItemTotals } = require('../billing/billing.service');

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Re-derive an invoice's total the same way billing.service.buildInvoice does
// for a no-discount, no-rounding invoice: total = round2(subtotal + tax).
function totalFor(items) {
  const { subtotal, tax } = computeItemTotals(items);
  return round2(subtotal + tax);
}

test('splitByItems: covers every item exactly once', () => {
  const items = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];
  const result = splitByItems(items, [['a', 'c'], ['b']]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].map((i) => i._id), ['a', 'c']);
  assert.deepEqual(result[1].map((i) => i._id), ['b']);
});

test('splitByItems: rejects an item id not on the order', () => {
  const items = [{ _id: 'a' }, { _id: 'b' }];
  assert.throws(() => splitByItems(items, [['a'], ['x']]), /does not belong to this order/);
});

test('splitByItems: rejects an item appearing in two groups', () => {
  const items = [{ _id: 'a' }, { _id: 'b' }];
  assert.throws(() => splitByItems(items, [['a'], ['a', 'b']]), /more than one split group/);
});

test('splitByItems: rejects incomplete coverage', () => {
  const items = [{ _id: 'a' }, { _id: 'b' }];
  assert.throws(() => splitByItems(items, [['a']]), /must be covered by exactly one split group/);
});

test('splitByItems: rejects empty/invalid splits input', () => {
  const items = [{ _id: 'a' }];
  assert.throws(() => splitByItems(items, []), /non-empty array/);
  assert.throws(() => splitByItems(items, [[]]), /non-empty array of item ids/);
});

test('splitEqually: N shares sum exactly to the order total (even split)', () => {
  const order = { orderNumber: 'ORD-TEST-0001', subtotal: 100, tax: 5 };
  const payloads = splitEqually(order, 4);
  assert.equal(payloads.length, 4);

  const orderTotal = totalFor([{ price: 100, qty: 1, taxRate: 5 }]);
  const sumOfInvoiceTotals = round2(payloads.reduce((sum, items) => sum + totalFor(items), 0));
  assert.equal(sumOfInvoiceTotals, orderTotal);
});

test('splitEqually: N shares sum exactly to the order total (uneven split, 3 ways)', () => {
  const order = { orderNumber: 'ORD-TEST-0002', subtotal: 100, tax: 5 };
  const payloads = splitEqually(order, 3);
  assert.equal(payloads.length, 3);

  const orderTotal = totalFor([{ price: 100, qty: 1, taxRate: 5 }]);
  const sumOfInvoiceTotals = round2(payloads.reduce((sum, items) => sum + totalFor(items), 0));
  assert.equal(sumOfInvoiceTotals, orderTotal);
});

test('splitEqually: works with an odd subtotal that does not divide evenly', () => {
  const order = { orderNumber: 'ORD-TEST-0003', subtotal: 133.37, tax: 6.67 };
  const payloads = splitEqually(order, 7);
  assert.equal(payloads.length, 7);

  const orderTotal = totalFor([{ price: 133.37, qty: 1, taxRate: (6.67 / 133.37) * 100 }]);
  const sumOfInvoiceTotals = round2(payloads.reduce((sum, items) => sum + totalFor(items), 0));
  assert.equal(sumOfInvoiceTotals, round2(orderTotal));
});

test('splitEqually: zero-tax order splits cleanly', () => {
  const order = { orderNumber: 'ORD-TEST-0004', subtotal: 100, tax: 0 };
  const payloads = splitEqually(order, 3);
  const sumOfInvoiceTotals = round2(payloads.reduce((sum, items) => sum + totalFor(items), 0));
  assert.equal(sumOfInvoiceTotals, 100);
  for (const items of payloads) {
    assert.equal(items[0].taxRate, 0);
  }
});

test('splitEqually: rejects non-positive ways', () => {
  const order = { orderNumber: 'ORD-TEST-0005', subtotal: 100, tax: 5 };
  assert.throws(() => splitEqually(order, 0), /positive integer/);
  assert.throws(() => splitEqually(order, -2), /positive integer/);
  assert.throws(() => splitEqually(order, 'abc'), /positive integer/);
});

test('splitEqually: ways=1 returns the whole order as a single share', () => {
  const order = { orderNumber: 'ORD-TEST-0006', subtotal: 100, tax: 5 };
  const payloads = splitEqually(order, 1);
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0][0].price, 100);
  const total = totalFor(payloads[0]);
  assert.equal(total, totalFor([{ price: 100, qty: 1, taxRate: 5 }]));
});
