const { createMachine } = require('../../common/fsm');

// Purchase Order FSM:
//   DRAFT -> PLACED -> PARTIALLY_RECEIVED <-> PARTIALLY_RECEIVED -> RECEIVED
//   PLACED -> RECEIVED directly (all lines received in a single receive call)
//   DRAFT/PLACED -> CANCELLED (never once any line has been received)
const poMachine = createMachine({
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED'],
  RECEIVED: [],
  CANCELLED: [],
});

module.exports = poMachine;
