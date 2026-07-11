const { createMachine } = require('../../common/fsm');

// Reservation FSM:
//   BOOKED -> SEATED -> COMPLETED
//   BOOKED -> CANCELLED
//   BOOKED -> NO_SHOW
const reservationMachine = createMachine({
  BOOKED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
});

module.exports = reservationMachine;
