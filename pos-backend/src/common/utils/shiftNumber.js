const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');

async function nextShiftNumber() {
  const key = `shift-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(2, '0');
  return `SH-${todayKey()}-${seq}`;
}

module.exports = { nextShiftNumber };
