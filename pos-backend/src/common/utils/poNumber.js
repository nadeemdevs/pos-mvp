const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');
const { counterKeySuffix, numberPrefix } = require('./branchCounter');

async function nextPoNumber() {
  const key = `po-${todayKey()}${counterKeySuffix()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(3, '0');
  return `PO-${numberPrefix()}${todayKey()}-${seq}`;
}

module.exports = { nextPoNumber };
