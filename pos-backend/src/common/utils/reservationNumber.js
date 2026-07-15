const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');
const { counterKeySuffix, numberPrefix } = require('./branchCounter');

async function nextReservationNumber() {
  const key = `reservation-${todayKey()}${counterKeySuffix()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(3, '0');
  return `RSV-${numberPrefix()}${todayKey()}-${seq}`;
}

module.exports = { nextReservationNumber };
