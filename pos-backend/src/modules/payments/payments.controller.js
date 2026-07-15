const asyncHandler = require('../../common/utils/asyncHandler');
const requestContext = require('../../common/requestContext');
const Invoice = require('../billing/invoice.model');
const Payment = require('./payment.model');
const factory = require('./PaymentProviderFactory');
const poller = require('./poller');
const { applyStatus, getPaymentConfig, emit, TERMINAL_STATUSES, ACTIVE_STATUSES } = require('./payments.service');
const ordersService = require('../orders/orders.service');
const eventBus = require('../../common/eventBus');
const auditService = require('../audit/audit.service');

// --- Manual cash/UPI flow — unchanged behavior, still live at POST /api/payments/manual ---
const manual = asyncHandler(async (req, res) => {
  const { invoiceId, method, amount, reference } = req.body;

  if (!invoiceId || !method || amount === undefined) {
    return res.status(400).json({ message: 'invoiceId, method and amount are required' });
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  if (invoice.paymentStatus === 'PAID') {
    return res.status(400).json({ message: 'Invoice is already paid' });
  }

  const provider = factory.get(method);
  const result = await provider.processManual(invoice, { amount, reference });

  const payment = await Payment.create({
    invoiceId: invoice._id,
    method: result.method,
    provider: result.method,
    amount: result.amount,
    tendered: result.tendered,
    change: result.change,
    reference: result.reference,
    status: result.status,
    receivedBy: { id: req.user.id, name: req.user.name },
  });

  invoice.paymentStatus = 'PAID';
  invoice.paymentMethod = result.method;
  invoice.paymentTransactionId = payment._id.toString();
  invoice.status = 'CLOSED';
  await invoice.save();

  emit('invoice.paid', {
    invoiceId: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    paymentMethod: invoice.paymentMethod,
  });
  eventBus.publish('invoice.paid', { invoice });

  // Mode 2 (dine-in): if this invoice belongs to an Order and every invoice
  // on that order is now PAID, close the order and free its table. No-op for
  // Mode 1 invoices (invoice.orderId unset).
  await ordersService.settleInvoicePaid(invoice);

  auditService.log({
    req,
    action: 'payment.manual',
    entity: 'Invoice',
    entityId: invoice._id,
    meta: { method: result.method, amount: result.amount, invoiceNumber: invoice.invoiceNumber },
  });

  res.status(201).json({ payment, invoice, change: result.change || 0 });
});

// --- Card-terminal lifecycle (Phase 2) ---

const initiate = asyncHandler(async (req, res) => {
  const { invoiceId, provider } = req.body;

  if (!invoiceId || !provider) {
    return res.status(400).json({ message: 'invoiceId and provider are required' });
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  if (invoice.paymentStatus !== 'PENDING') {
    return res.status(400).json({ message: 'Invoice is not pending payment' });
  }

  const config = await getPaymentConfig();
  const enabled = config.enabled || [];
  if (!enabled.includes(provider)) {
    return res.status(400).json({ message: `Provider ${provider} is not enabled` });
  }

  // Idempotency: if a payment is already in flight for this invoice, hand that
  // back instead of creating a second one (e.g. cashier double-taps "Pay").
  const existing = await Payment.findOne({ invoiceId: invoice._id, status: { $in: ACTIVE_STATUSES } });
  if (existing) {
    return res.status(200).json({ payment: existing });
  }

  let paymentProvider;
  try {
    paymentProvider = factory.get(provider);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const payment = await Payment.create({
    invoiceId: invoice._id,
    method: 'CARD',
    provider,
    amount: invoice.total,
    status: 'INITIATED',
    receivedBy: { id: req.user.id, name: req.user.name },
  });

  try {
    const result = await paymentProvider.initiatePayment(invoice, payment, config);
    payment.reference = result.reference || payment.reference;
    payment.rawResponse = result.rawResponse;
    payment.status = result.status || 'PROCESSING';
    await payment.save();
  } catch (err) {
    payment.status = 'FAILED';
    payment.failureReason = err.message;
    await payment.save();
    emit('payment.updated', {
      paymentId: payment._id,
      invoiceId: invoice._id,
      status: payment.status,
      invoiceNumber: invoice.invoiceNumber,
    });
    return res.status(201).json({ payment });
  }

  if (ACTIVE_STATUSES.includes(payment.status)) {
    poller.register(payment._id, payment.createdAt.getTime());
  }

  emit('payment.updated', {
    paymentId: payment._id,
    invoiceId: invoice._id,
    status: payment.status,
    invoiceNumber: invoice.invoiceNumber,
  });

  res.status(201).json({ payment });
});

// GET /api/payments?invoiceId=... — powers the Invoices page's payment
// history / "amount already paid" display (used to compute the settle-delta
// balance after editing a paid invoice).
const list = asyncHandler(async (req, res) => {
  const { invoiceId } = req.query;
  if (!invoiceId) return res.status(400).json({ message: 'invoiceId is required' });

  const payments = await Payment.find({ invoiceId }).sort({ createdAt: 1 });
  res.json({ items: payments });
});

const getOne = asyncHandler(async (req, res) => {
  let payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });

  if (payment.method === 'CARD' && ACTIVE_STATUSES.includes(payment.status)) {
    const config = await getPaymentConfig();
    try {
      const provider = factory.get(payment.provider);
      const result = await provider.getStatus(payment, config);
      const updated = await applyStatus(payment, result);
      if (updated) payment = updated;
      if (TERMINAL_STATUSES.includes(payment.status)) {
        poller.unregister(payment._id);
      }
    } catch (err) {
      console.error('[payments] getStatus check failed for payment', payment._id.toString(), err.message);
    }
  }

  res.json({ payment });
});

const cancel = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });

  if (!ACTIVE_STATUSES.includes(payment.status)) {
    return res.status(400).json({ message: `Cannot cancel a payment in status ${payment.status}` });
  }

  const config = await getPaymentConfig();
  const provider = factory.get(payment.provider);
  const result = await provider.cancelPayment(payment, config);

  const updated = await applyStatus(payment, {
    status: result.status || 'CANCELLED',
    rawResponse: result.rawResponse,
  });
  poller.unregister(payment._id);

  res.json({ payment: updated });
});

// POST /api/payments/callback/:provider — vendor webhook, no auth.
// POST /api/payments/callback (legacy alias, provider taken from body) is also
// routed here.
const callback = asyncHandler(async (req, res) => {
  const providerKey = (req.params.provider || req.body.provider || '').toUpperCase();

  let providerAdapter;
  try {
    providerAdapter = factory.get(providerKey);
  } catch (err) {
    return res.status(400).json({ message: `Unknown provider: ${providerKey}` });
  }

  const reference =
    req.body.reference || req.body.transactionId || req.body.PlutusTransactionReferenceID || req.body.txnRef;
  if (!reference) {
    return res.status(400).json({ message: 'Callback payload is missing a transaction reference' });
  }

  // Phase 6.1 — this is an unauthenticated vendor webhook, so the ambient
  // context is the 'default' fallback. Resolve the payment ACROSS tenants by
  // its reference, then run everything (per-tenant provider secrets from
  // settings, signature verification, status application and its downstream
  // subscribers/emits) inside that payment's own tenant/branch context.
  const payment = await Payment.findOne({ reference }).setOptions({ skipTenantScope: true });
  if (!payment) return res.status(404).json({ message: 'Payment not found for reference' });

  await requestContext.run(
    { tenantId: payment.tenantId || 'default', branchId: payment.branchId || 'main' },
    async () => {
      const config = await getPaymentConfig();

      let verified;
      try {
        verified = providerAdapter.verifyCallback(req, config);
      } catch (err) {
        if (err.message === 'Not implemented') {
          return res.status(501).json({ message: `${providerKey} does not support callbacks` });
        }
        throw err;
      }

      if (!verified) {
        return res.status(401).json({ message: 'Invalid callback signature' });
      }

      // Re-derive the authoritative status from the provider rather than
      // trusting the webhook body directly — it's just a "something changed,
      // go check" signal.
      const result = await providerAdapter.getStatus(payment, config);
      const updated = await applyStatus(payment, result);

      if (updated && TERMINAL_STATUSES.includes(updated.status)) {
        poller.unregister(updated._id);
      }

      res.json({ message: 'Callback processed', payment: updated });
    }
  );
});

module.exports = { manual, initiate, list, getOne, cancel, callback };
