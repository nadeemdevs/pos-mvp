const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, trim: true },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
