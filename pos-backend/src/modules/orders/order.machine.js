const { createMachine } = require('../../common/fsm');

// Order FSM:
//   OPEN -> BILL_REQUESTED -> INVOICED -> PAID -> CLOSED
//   OPEN -> INVOICED directly is also permitted (counter-flow: bill without a
//     separate "request bill" step), gated at the service layer on there
//     being no unfired items.
//   CANCELLED is reachable from OPEN or BILL_REQUESTED only (never once an
//     invoice exists).
const orderMachine = createMachine({
  OPEN: ['BILL_REQUESTED', 'INVOICED', 'CANCELLED'],
  BILL_REQUESTED: ['INVOICED', 'CANCELLED'],
  INVOICED: ['PAID'],
  PAID: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
});

module.exports = orderMachine;
