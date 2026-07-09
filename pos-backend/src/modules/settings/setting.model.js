const mongoose = require('mongoose');

const paymentProvidersSchema = new mongoose.Schema(
  {
    // Which card providers cashiers are allowed to select at POST /api/payments/initiate.
    enabled: { type: [String], default: ['MOCK'] },
    mock: {
      delayMs: { type: Number, default: 5000 },
      outcome: { type: String, enum: ['SUCCESS', 'FAILED', 'TIMEOUT'], default: 'SUCCESS' },
    },
    pinelabs: {
      merchantId: { type: String, default: '' },
      securityToken: { type: String, default: '' },
      storeId: { type: String, default: '' },
      clientId: { type: String, default: '' },
      imei: { type: String, default: '' },
      baseUrl: { type: String, default: 'https://www.plutuscloudserviceuat.in:8201' },
    },
    worldline: {
      merchantCode: { type: String, default: '' },
      terminalId: { type: String, default: '' },
      securityToken: { type: String, default: '' },
      baseUrl: { type: String, default: '' },
    },
  },
  { _id: false }
);

const discountPresetSchema = new mongoose.Schema(
  {
    label: { type: String },
    type: { type: String, enum: ['FLAT', 'PERCENT'] },
    value: { type: Number },
  },
  { _id: false }
);

const discountsSchema = new mongoose.Schema(
  {
    maxPercent: { type: Number, default: 100 },
    presets: { type: [discountPresetSchema], default: [] },
  },
  { _id: false }
);

const roundingSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    nearest: { type: Number, default: 1 },
  },
  { _id: false }
);

const settingSchema = new mongoose.Schema(
  {
    restaurantName: { type: String, default: 'My Restaurant' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    taxRate: { type: Number, default: 5 },
    currency: { type: String, default: 'INR' },
    receiptFooter: { type: String, default: 'Thank you for visiting!' },
    paymentProviders: { type: paymentProvidersSchema, default: () => ({}) },
    discounts: { type: discountsSchema, default: () => ({}) },
    rounding: { type: roundingSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
