const mongoose = require('mongoose');
const asyncHandler = require('../../common/utils/asyncHandler');
const Invoice = require('../billing/invoice.model');
const Payment = require('../payments/payment.model');

// Date strings are business dates: interpret day boundaries in the server's
// local timezone, not UTC — otherwise sales before 5:30am IST land on the
// previous day's report.
function localDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

function todayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dayRange(dateStr) {
  const date = dateStr || todayStr();
  const { start, end } = localDay(date);
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
    if (from) match.createdAt.$gte = localDay(from).start;
    if (to) match.createdAt.$lte = localDay(to).end;
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

function dateMatch(from, to) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = localDay(from).start;
    if (to) match.createdAt.$lte = localDay(to).end;
  }
  return match;
}

const discounts = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const match = { ...dateMatch(from, to), discount: { $gt: 0 }, status: { $ne: 'CANCELLED' } };

  const invoiceDocs = await Invoice.find(match).sort({ createdAt: -1 });

  let totalDiscount = 0;
  const invoices = invoiceDocs.map((inv) => {
    totalDiscount += inv.discount;
    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.createdAt,
      cashierName: inv.cashier && inv.cashier.name,
      subtotal: inv.subtotal,
      discount: inv.discount,
      discountType: inv.discountType,
      discountValue: inv.discountValue,
      total: inv.total,
    };
  });

  res.json({ totalDiscount: round2(totalDiscount), invoiceCount: invoices.length, invoices });
});

const cancelled = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const match = { ...dateMatch(from, to), status: 'CANCELLED' };

  const invoiceDocs = await Invoice.find(match).sort({ createdAt: -1 });

  let totalValue = 0;
  const invoices = invoiceDocs.map((inv) => {
    totalValue += inv.total;
    return {
      invoiceNumber: inv.invoiceNumber,
      date: inv.createdAt,
      cashierName: inv.cashier && inv.cashier.name,
      total: inv.total,
    };
  });

  res.json({ count: invoices.length, totalValue: round2(totalValue), invoices });
});

const tax = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const match = { ...dateMatch(from, to), paymentStatus: 'PAID' };

  const byRateRaw = await Invoice.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.taxRate',
        taxableAmount: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  let totalTax = 0;
  let taxableSales = 0;
  const byRate = byRateRaw.map((r) => {
    const taxRate = r._id || 0;
    const taxableAmount = round2(r.taxableAmount);
    const taxAmount = round2((taxableAmount * taxRate) / 100);
    totalTax += taxAmount;
    taxableSales += taxableAmount;
    return { taxRate, taxableAmount, tax: taxAmount };
  });

  res.json({ totalTax: round2(totalTax), taxableSales: round2(taxableSales), byRate });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { daily, items, payments, discounts, cancelled, tax };
