// Tiny generic finite-state-machine helper.
//
// `transitions` is a plain object mapping each state to the list of states it
// may move to, e.g. { OPEN: ['CLOSED'], CLOSED: [] }. States not present as a
// key are treated as having no allowed outgoing transitions.
function createMachine(transitions) {
  function canTransition(from, to) {
    const allowed = transitions[from] || [];
    return allowed.includes(to);
  }

  function assertTransition(from, to) {
    if (!canTransition(from, to)) {
      const err = new Error(`Invalid transition ${from} → ${to}`);
      err.status = 400;
      throw err;
    }
  }

  return { canTransition, assertTransition, transitions };
}

module.exports = { createMachine };
