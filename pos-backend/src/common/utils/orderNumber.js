const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');

async function nextOrderNumber() {
  const key = `order-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(4, '0');
  return `ORD-${todayKey()}-${seq}`;
}

module.exports = { nextOrderNumber };
