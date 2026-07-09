const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    restaurantName: { type: String, default: 'My Restaurant' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    taxRate: { type: Number, default: 5 },
    currency: { type: String, default: 'INR' },
    receiptFooter: { type: String, default: 'Thank you for visiting!' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
