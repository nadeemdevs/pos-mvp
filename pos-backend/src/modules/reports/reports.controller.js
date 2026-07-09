const mongoose = require('mongoose');
const asyncHandler = require('../../common/utils/asyncHandler');
const Invoice = require('../billing/invoice.model');
const Payment = require('../payments/payment.model');

function dayRange(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  return { date, start, end };
}

const daily = asyncHandler(async (req, res) => {
  const { date, start, end } = dayRange(req.query.date);

  const invoices = await Invoice.find({ createdAt: { $gte: start, $lte: end } });

  let invoiceCount = 0;
  let gross = 0;
  let tax = 0;
  let discount = 0;
  let net = 0;
  let cancelled = 0;

  for (const inv of invoices) {
    if (inv.status === 'CANCELLED') {
      cancelled += 1;
      continue;
    }
    invoiceCount += 1;
    gross += inv.subtotal;
    tax += inv.tax;
    discount += inv.discount;
    net += inv.total;
  }

  const byPaymentMethod = await Payment.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, status: 'SUCCESS' } },
    { $group: { _id: '$method', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    { $project: { _id: 0, method: '$_id', count: 1, amount: 1 } },
  ]);

  res.json({
    date,
    invoiceCount,
    gross: round2(gross),
    tax: round2(tax),
    discount: round2(discount),
    net: round2(net),
    cancelled,
    byPaymentMethod,
  });
});

const items = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const match = {};

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) match.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  match.status = { $ne: 'CANCELLED' };

  const result = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.menuItemId',
        name: { $first: '$items.name' },
        qty: { $sum: '$items.qty' },
        amount: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
      },
    },
    { $project: { _id: 0, menuItemId: '$_id', name: 1, qty: 1, amount: 1 } },
    { $sort: { qty: -1 } },
  ]);

  res.json(result);
});

const payments = asyncHandler(async (req, res) => {
  const { start, end, date } = dayRange(req.query.date);

  const result = await Payment.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$method', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    { $project: { _id: 0, method: '$_id', count: 1, amount: 1 } },
  ]);

  res.json({ date, byPaymentMethod: result });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { daily, items, payments };
