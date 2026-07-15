// In-process fallback poller for card-terminal payments, in case a vendor webhook
// gets lost. Keeps a simple setInterval per in-flight payment (no new deps) and
// stops itself once the payment reaches a terminal state or the 120s ceiling.
const Payment = require('./payment.model');
const factory = require('./PaymentProviderFactory');
const requestContext = require('../../common/requestContext');
const { applyStatus, getPaymentConfig, TERMINAL_STATUSES } = require('./payments.service');

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000;
const ACTIVE_STATUSES = ['INITIATED', 'PROCESSING'];

// paymentId (string) -> { interval, startedAt }
const timers = new Map();

function register(paymentId, startedAt = Date.now()) {
  const id = String(paymentId);
  if (timers.has(id)) return; // already polling this payment

  const interval = setInterval(() => {
    poll(id).catch((err) => {
      console.error('[poller] poll failed for payment', id, err.message);
    });
  }, POLL_INTERVAL_MS);

  timers.set(id, { interval, startedAt });
}

function unregister(paymentId) {
  const id = String(paymentId);
  const entry = timers.get(id);
  if (entry) {
    clearInterval(entry.interval);
    timers.delete(id);
  }
}

async function poll(id) {
  const entry = timers.get(id);
  if (!entry) return;

  // setInterval callbacks have NO AsyncLocalStorage request context — fetch
  // the payment unscoped, then run everything downstream (per-tenant
  // settings lookup, applyStatus -> invoice update -> invoice.paid
  // subscribers like loyalty/stock deduction, socket emits) inside the
  // payment's own tenant/branch context. (Phase 6.1)
  const payment = await Payment.findById(id);
  if (!payment || !ACTIVE_STATUSES.includes(payment.status)) {
    unregister(id);
    return;
  }

  await requestContext.run(
    { tenantId: payment.tenantId || 'default', branchId: payment.branchId || 'main' },
    async () => {
      const elapsed = Date.now() - entry.startedAt;
      const config = await getPaymentConfig();
      const provider = factory.get(payment.provider);

      if (elapsed >= TIMEOUT_MS) {
        unregister(id);
        try {
          await provider.cancelPayment(payment, config);
        } catch (err) {
          console.error('[poller] best-effort cancel failed for payment', id, err.message);
        }
        await applyStatus(payment, { status: 'TIMEOUT', rawResponse: { reason: 'poller-timeout' } });
        return;
      }

      const result = await provider.getStatus(payment, config);
      const updated = await applyStatus(payment, result);

      if (updated && TERMINAL_STATUSES.includes(updated.status)) {
        unregister(id);
      }
    }
  );
}

/**
 * Resume polling for payments that were still in-flight when the process last
 * exited (e.g. server restart mid-transaction).
 */
async function resumeAll() {
  const stale = await Payment.find({ status: { $in: ACTIVE_STATUSES }, method: 'CARD' });
  for (const payment of stale) {
    register(payment._id, payment.createdAt ? payment.createdAt.getTime() : Date.now());
  }
  if (stale.length) {
    console.log(`[poller] resumed polling for ${stale.length} stale payment(s)`);
  }
  return stale.length;
}

module.exports = { register, unregister, resumeAll };
