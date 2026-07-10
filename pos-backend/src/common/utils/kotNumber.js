const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');

// Daily-resetting sequence — display format intentionally omits the date
// (KOT-XXXX), unlike ORD-YYYYMMDD-XXXX / INV-YYYYMMDD-XXXX, per spec.
async function nextKotNumber() {
  const key = `kot-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(4, '0');
  return `KOT-${seq}`;
}

module.exports = { nextKotNumber };
