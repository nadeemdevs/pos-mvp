const Invoice = require('./invoice.model');
const { nextInvoiceNumber } = require('../../common/utils/invoiceNumber');

function computeTotals(items = [], discount = 0) {
  let subtotal = 0;
  let tax = 0;

  for (const item of items) {
    const lineAmount = item.price * item.qty;
    const lineTax = (lineAmount * (item.taxRate || 0)) / 100;
    subtotal += lineAmount;
    tax += lineTax;
  }

  subtotal = round2(subtotal);
  tax = round2(tax);
  const total = round2(subtotal + tax - (discount || 0));

  return { subtotal, tax, total };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function createInvoice(payload, user) {
  const { items = [], discount = 0, customer, status = 'OPEN' } = payload;

  if (!items.length) {
    const err = new Error('Invoice must have at least one item');
    err.status = 400;
    throw err;
  }

  const { subtotal, tax, total } = computeTotals(items, discount);
  const invoiceNumber = await nextInvoiceNumber();

  const invoice = await Invoice.create({
    invoiceNumber,
    items,
    subtotal,
    tax,
    discount,
    total,
    customer,
    status,
    paymentStatus: 'PENDING',
    cashier: { id: user.id, name: user.name },
  });

  return invoice;
}

async function listInvoices(query) {
  const { date, paymentStatus, status, page = 1, limit = 20 } = query;
  const filter = {};

  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (status) filter.status = status;

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    filter.createdAt = { $gte: start, $lte: end };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Invoice.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getInvoice(id) {
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  return invoice;
}

async function updateInvoice(id, payload) {
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }

  const { items, discount, customer, status } = payload;

  if (status === 'CANCELLED') {
    invoice.status = 'CANCELLED';
    await invoice.save();
    return invoice;
  }

  if (invoice.paymentStatus !== 'PENDING' && (items || discount !== undefined)) {
    const err = new Error('Cannot modify items/discount of a paid invoice');
    err.status = 400;
    throw err;
  }

  if (items) invoice.items = items;
  if (discount !== undefined) invoice.discount = discount;
  if (customer) invoice.customer = customer;
  if (status) invoice.status = status;

  const { subtotal, tax, total } = computeTotals(invoice.items, invoice.discount);
  invoice.subtotal = subtotal;
  invoice.tax = tax;
  invoice.total = total;

  await invoice.save();
  return invoice;
}

module.exports = { computeTotals, createInvoice, listInvoices, getInvoice, updateInvoice };
