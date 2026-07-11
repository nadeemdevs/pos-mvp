const Counter = require('../../modules/billing/counter.model');
const { todayKey } = require('./dateKey');

async function nextReservationNumber() {
  const key = `reservation-${todayKey()}`;
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const seq = String(counter.seq).padStart(3, '0');
  return `RSV-${todayKey()}-${seq}`;
}

module.exports = { nextReservationNumber };
