const mongoose = require('mongoose');
const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');

async function nextInvoiceNumber() {
  const key = `invoice-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(4, '0');
  return `INV-${todayKey()}-${seq}`;
}

module.exports = { nextInvoiceNumber };
