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

const printerTargetSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['BROWSER', 'ESCPOS_NETWORK'], default: 'BROWSER' },
    host: { type: String, default: '' },
    port: { type: Number, default: 9100 },
  },
  { _id: false }
);

const printingSchema = new mongoose.Schema(
  {
    kot: { type: printerTargetSchema, default: () => ({}) },
    receipt: { type: printerTargetSchema, default: () => ({}) },
  },
  { _id: false }
);

const featuresSchema = new mongoose.Schema(
  {
    // Gates the dine-in (Mode 2) UI. Backend APIs (tables/orders/kots) stay
    // available regardless of this flag.
    dineIn: { type: Boolean, default: false },
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
    printing: { type: printingSchema, default: () => ({}) },
    features: { type: featuresSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
