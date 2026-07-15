const test = require('node:test');
const assert = require('node:assert/strict');

const reservationMachine = require('./reservation.machine');

test('Reservation machine: allowed transitions', () => {
  assert.equal(reservationMachine.canTransition('BOOKED', 'SEATED'), true);
  assert.equal(reservationMachine.canTransition('BOOKED', 'CANCELLED'), true);
  assert.equal(reservationMachine.canTransition('BOOKED', 'NO_SHOW'), true);
  assert.equal(reservationMachine.canTransition('SEATED', 'COMPLETED'), true);
});

test('Reservation machine: forbidden transitions', () => {
  assert.equal(reservationMachine.canTransition('CANCELLED', 'SEATED'), false);
  assert.equal(reservationMachine.canTransition('NO_SHOW', 'SEATED'), false);
  assert.equal(reservationMachine.canTransition('COMPLETED', 'SEATED'), false);
  assert.equal(reservationMachine.canTransition('SEATED', 'CANCELLED'), false);
  assert.equal(reservationMachine.canTransition('BOOKED', 'COMPLETED'), false);
  assert.throws(
    () => reservationMachine.assertTransition('CANCELLED', 'SEATED'),
    /Invalid transition CANCELLED → SEATED/
  );
});
