const mongoose = require('mongoose');
const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');
const { counterKeySuffix, numberPrefix } = require('./branchCounter');

async function nextInvoiceNumber() {
  const key = `invoice-${todayKey()}${counterKeySuffix()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(4, '0');
  return `INV-${numberPrefix()}${todayKey()}-${seq}`;
}

module.exports = { nextInvoiceNumber };
