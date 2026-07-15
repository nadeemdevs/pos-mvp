// AsyncLocalStorage-backed request context — carries {tenantId, branchId} through
// the entire async call chain of a request (including event-bus subscribers
// invoked synchronously from within a request handler), so deeply-nested code
// (mongoose query hooks, counters) can read the current branch without every
// function needing an explicit req/branchId parameter threaded through it.
//
// Outside of a request (scripts, direct `node -e`, background timers not
// spawned from within als.run) `get()` returns undefined — callers must treat
// a missing context as "no scoping applied" rather than throwing.
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

function run(context, fn) {
  return als.run(context, fn);
}

function get() {
  return als.getStore();
}

module.exports = { run, get };
