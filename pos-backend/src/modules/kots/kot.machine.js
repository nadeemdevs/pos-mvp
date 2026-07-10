const { createMachine } = require('../../common/fsm');

// KOT (Kitchen Order Ticket) FSM:
//   NEW -> PREPARING -> READY -> SERVED
//   CANCELLED is reachable from NEW or PREPARING only (once READY the food is
//   effectively done and should be served, not cancelled).
const kotMachine = createMachine({
  NEW: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
});

module.exports = kotMachine;
