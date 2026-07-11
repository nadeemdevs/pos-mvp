const mongoose = require('mongoose');

const movementSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    by: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema(
  {
    shiftNumber: { type: String, required: true, unique: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    openedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    openedAt: { type: Date, default: Date.now },
    openingFloat: { type: Number, required: true, min: 0 },
    closedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String },
    },
    closedAt: { type: Date },
    expectedCash: { type: Number },
    declaredCash: { type: Number },
    variance: { type: Number },
    movements: { type: [movementSchema], default: [] },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shift', shiftSchema);
