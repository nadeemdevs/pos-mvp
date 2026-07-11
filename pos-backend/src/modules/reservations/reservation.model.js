const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    reservationNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    // Snapshot of what the booker typed in — independent of later Customer edits.
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
    },
    partySize: { type: Number, default: 2 },
    scheduledAt: { type: Date, required: true },
    // Preference at booking time only — the actual table is chosen at seat time.
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
    tableName: { type: String },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: ['BOOKED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
      default: 'BOOKED',
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reservation', reservationSchema);
