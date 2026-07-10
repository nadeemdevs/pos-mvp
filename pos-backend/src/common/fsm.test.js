const test = require('node:test');
const assert = require('node:assert/strict');

const { createMachine } = require('./fsm');
const orderMachine = require('../modules/orders/order.machine');
const kotMachine = require('../modules/kots/kot.machine');

test('createMachine: canTransition reflects the transitions map', () => {
  const m = createMachine({ A: ['B'], B: [] });
  assert.equal(m.canTransition('A', 'B'), true);
  assert.equal(m.canTransition('B', 'A'), false);
  assert.equal(m.canTransition('A', 'A'), false);
  // Unknown "from" state simply has no allowed transitions.
  assert.equal(m.canTransition('Z', 'A'), false);
});

test('createMachine: assertTransition throws a 400 with the expected message', () => {
  const m = createMachine({ A: ['B'], B: [] });
  assert.doesNotThrow(() => m.assertTransition('A', 'B'));

  try {
    m.assertTransition('B', 'A');
    assert.fail('expected assertTransition to throw');
  } catch (err) {
    assert.equal(err.status, 400);
    assert.equal(err.message, 'Invalid transition B → A');
  }
});

test('order machine: allowed transitions', () => {
  assert.equal(orderMachine.canTransition('OPEN', 'BILL_REQUESTED'), true);
  assert.equal(orderMachine.canTransition('OPEN', 'INVOICED'), true);
  assert.equal(orderMachine.canTransition('OPEN', 'CANCELLED'), true);
  assert.equal(orderMachine.canTransition('BILL_REQUESTED', 'INVOICED'), true);
  assert.equal(orderMachine.canTransition('BILL_REQUESTED', 'CANCELLED'), true);
  assert.equal(orderMachine.canTransition('INVOICED', 'PAID'), true);
  assert.equal(orderMachine.canTransition('PAID', 'CLOSED'), true);
});

test('order machine: forbidden transitions', () => {
  assert.equal(orderMachine.canTransition('INVOICED', 'CANCELLED'), false);
  assert.equal(orderMachine.canTransition('PAID', 'CANCELLED'), false);
  assert.equal(orderMachine.canTransition('CLOSED', 'OPEN'), false);
  assert.equal(orderMachine.canTransition('CANCELLED', 'OPEN'), false);
  assert.equal(orderMachine.canTransition('PAID', 'OPEN'), false);
  assert.equal(orderMachine.canTransition('BILL_REQUESTED', 'OPEN'), false);
  assert.throws(() => orderMachine.assertTransition('INVOICED', 'CANCELLED'), /Invalid transition INVOICED → CANCELLED/);
});

test('kot machine: allowed transitions', () => {
  assert.equal(kotMachine.canTransition('NEW', 'PREPARING'), true);
  assert.equal(kotMachine.canTransition('NEW', 'CANCELLED'), true);
  assert.equal(kotMachine.canTransition('PREPARING', 'READY'), true);
  assert.equal(kotMachine.canTransition('PREPARING', 'CANCELLED'), true);
  assert.equal(kotMachine.canTransition('READY', 'SERVED'), true);
});

test('kot machine: forbidden transitions', () => {
  assert.equal(kotMachine.canTransition('READY', 'CANCELLED'), false);
  assert.equal(kotMachine.canTransition('SERVED', 'READY'), false);
  assert.equal(kotMachine.canTransition('NEW', 'READY'), false);
  assert.equal(kotMachine.canTransition('NEW', 'SERVED'), false);
  assert.equal(kotMachine.canTransition('CANCELLED', 'NEW'), false);
  assert.throws(() => kotMachine.assertTransition('READY', 'CANCELLED'), /Invalid transition READY → CANCELLED/);
});
