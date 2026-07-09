const Invoice = require('../billing/invoice.model');
const Payment = require('./payment.model');
const Setting = require('../settings/setting.model');
const { getIO } = require('../../sockets');

const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT'];
const ACTIVE_STATUSES = ['INITIATED', 'PROCESSING'];

function emit(event, payload) {
  try {
    getIO().emit(event, payload);
  } catch (err) {
    // socket not initialized (e.g. in tests/scripts) — ignore
  }
}

async function getPaymentConfig() {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }
  return (settings.paymentProviders && settings.paymentProviders.toObject
    ? settings.paymentProviders.toObject()
    : settings.paymentProviders) || {};
}

/**
 * Single choke-point for moving a payment into a new status.
 *
 * - Never trusts client input for amounts — invoice.total is the only source of
 *   truth for what gets marked PAID.
 * - Idempotent: once a payment is in a terminal status, further calls are a no-op
 *   (enforced atomically via the findOneAndUpdate filter below, so concurrent
 *   callback + poller races can't double-process).
 * - Mirrors the manual-payment side effects on SUCCESS: invoice.paymentStatus,
 *   paymentMethod, paymentTransactionId, status all get set the same way
 *   POST /api/payments/manual sets them.
 */
async function applyStatus(paymentOrId, { status, rawResponse, cardDetails, failureReason } = {}) {
  const paymentId = paymentOrId && paymentOrId._id ? paymentOrId._id : paymentOrId;

  const setFields = {};
  if (status) setFields.status = status;
  if (rawResponse !== undefined) setFields.rawResponse = rawResponse;
  if (cardDetails) setFields.cardDetails = cardDetails;
  if (failureReason) setFields.failureReason = failureReason;

  // Atomic guard: only apply if the payment isn't already in a terminal state.
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $nin: TERMINAL_STATUSES } },
    { $set: setFields },
    { new: true }
  );

  if (!payment) {
    // Already terminal (or doesn't exist) — idempotent no-op.
    return Payment.findById(paymentId);
  }

  const invoice = await Invoice.findById(payment.invoiceId);

  if (status === 'SUCCESS' && invoice && invoice.paymentStatus !== 'PAID') {
    invoice.paymentStatus = 'PAID';
    invoice.paymentMethod = payment.method === 'CARD' ? payment.provider || 'CARD' : payment.method;
    invoice.paymentTransactionId = payment._id.toString();
    invoice.status = 'CLOSED';
    await invoice.save();

    emit('invoice.paid', {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      paymentMethod: invoice.paymentMethod,
    });
  }

  emit('payment.updated', {
    paymentId: payment._id,
    invoiceId: payment.invoiceId,
    status: payment.status,
    invoiceNumber: invoice ? invoice.invoiceNumber : undefined,
  });

  return payment;
}

module.exports = { applyStatus, getPaymentConfig, emit, TERMINAL_STATUSES, ACTIVE_STATUSES };
