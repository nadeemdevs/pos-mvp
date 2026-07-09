const asyncHandler = require('../../common/utils/asyncHandler');
const Invoice = require('../billing/invoice.model');
const Payment = require('./payment.model');
const factory = require('./PaymentProviderFactory');
const { getIO } = require('../../sockets');

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

  try {
    getIO().emit('invoice.paid', {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      paymentMethod: invoice.paymentMethod,
    });
  } catch (err) {
    // socket not initialized (e.g. in tests) — ignore
  }

  res.status(201).json({ payment, invoice, change: result.change || 0 });
});

const initiate = asyncHandler(async (req, res) => {
  const { invoiceId, provider } = req.body;

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

  const paymentProvider = factory.get(provider);

  try {
    const result = await paymentProvider.initiate(invoice);
    res.json(result);
  } catch (err) {
    if (err.message === 'Not implemented') {
      return res.status(501).json({ message: `${provider} integration not implemented yet` });
    }
    throw err;
  }
});

const callback = asyncHandler(async (req, res) => {
  const { reference, status } = req.body;

  const payment = await Payment.findOne({ reference });
  if (!payment) return res.status(404).json({ message: 'Payment not found for reference' });

  payment.status = status || payment.status;
  await payment.save();

  res.json({ message: 'Callback processed', payment });
});

module.exports = { manual, initiate, callback };
