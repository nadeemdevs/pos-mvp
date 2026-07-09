const mongoose = require('mongoose');
const Counter = require('../../modules/billing/counter.model');

function todayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

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
