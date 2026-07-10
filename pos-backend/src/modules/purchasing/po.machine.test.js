const test = require('node:test');
const assert = require('node:assert/strict');

const poMachine = require('./po.machine');

test('PO machine: allowed transitions', () => {
  assert.equal(poMachine.canTransition('DRAFT', 'PLACED'), true);
  assert.equal(poMachine.canTransition('DRAFT', 'CANCELLED'), true);
  assert.equal(poMachine.canTransition('PLACED', 'PARTIALLY_RECEIVED'), true);
  assert.equal(poMachine.canTransition('PLACED', 'RECEIVED'), true);
  assert.equal(poMachine.canTransition('PLACED', 'CANCELLED'), true);
  assert.equal(poMachine.canTransition('PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED'), true);
  assert.equal(poMachine.canTransition('PARTIALLY_RECEIVED', 'RECEIVED'), true);
});

test('PO machine: forbidden transitions', () => {
  assert.equal(poMachine.canTransition('RECEIVED', 'PLACED'), false);
  assert.equal(poMachine.canTransition('CANCELLED', 'DRAFT'), false);
  assert.equal(poMachine.canTransition('PARTIALLY_RECEIVED', 'CANCELLED'), false);
  assert.equal(poMachine.canTransition('PARTIALLY_RECEIVED', 'DRAFT'), false);
  assert.equal(poMachine.canTransition('DRAFT', 'RECEIVED'), false);
  assert.throws(
    () => poMachine.assertTransition('RECEIVED', 'PLACED'),
    /Invalid transition RECEIVED → PLACED/
  );
});
