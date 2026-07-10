// Thin wrapper over node:events — the app-wide event bus for Phase 5.1.
//
// publish(event, payload):
//   - logs `[event] <name>` to the console (cheap observability without a
//     dedicated logging pipeline),
//   - best-effort mirrors the same event to the 'floor' socket room (wrapped
//     in try/catch so it's safe to call from tests/scripts where socket.io
//     was never initialized),
//   - synchronously emits on the underlying EventEmitter for in-process
//     subscribers (src/subscribers/index.js).
//
// This is intentionally NOT a replacement for the existing direct
// `emitTo('floor', ...)` calls sprinkled through orders/payments services —
// those stay as-is. publish() is the new mechanism additive on top, so
// in-process subscribers (audit, stock deduction) can react to domain events
// without every service having to know about every subscriber.
const EventEmitter = require('node:events');
const { emitTo } = require('../sockets');

const bus = new EventEmitter();
bus.setMaxListeners(50);

function publish(event, payload) {
  console.log(`[event] ${event}`);

  try {
    emitTo('floor', event, payload);
  } catch (err) {
    // socket not initialized (e.g. in tests/scripts) — ignore
  }

  try {
    bus.emit(event, payload);
  } catch (err) {
    // A subscriber threw synchronously — don't let that break the publisher.
    console.error(`[event] subscriber for "${event}" threw:`, err.message);
  }
}

function subscribe(event, handler) {
  bus.on(event, handler);
}

module.exports = { publish, subscribe };
