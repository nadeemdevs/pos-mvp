const Setting = require('./setting.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }
  res.json(settings);
});

// Shallow-merge nested paymentProviders sub-objects so a PUT that only touches
// e.g. { paymentProviders: { mock: { outcome: 'FAILED' } } } doesn't wipe out
// the sibling fields (delayMs, etc.) or the other provider configs.
function mergePaymentProviders(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.enabled !== undefined) merged.enabled = incoming.enabled;

  for (const key of ['mock', 'pinelabs', 'worldline']) {
    if (incoming[key]) {
      merged[key] = { ...(currentObj[key] || {}), ...incoming[key] };
    }
  }

  return merged;
}

// Same shallow-merge idea as mergePaymentProviders, applied to the new
// discounts/rounding sub-objects so a PUT that only touches one field (e.g.
// { discounts: { maxPercent: 20 } }) doesn't wipe out sibling fields
// (presets, etc).
function mergeDiscounts(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.maxPercent !== undefined) merged.maxPercent = incoming.maxPercent;
  if (incoming.presets !== undefined) merged.presets = incoming.presets;

  return merged;
}

function mergeRounding(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.enabled !== undefined) merged.enabled = incoming.enabled;
  if (incoming.nearest !== undefined) merged.nearest = incoming.nearest;

  return merged;
}

// Same shallow-merge idea, one level deeper: printing.{kot,receipt} are each
// sub-objects of their own, so a PUT touching only printing.kot.host must not
// wipe printing.kot.port or printing.receipt entirely.
function mergePrinterTarget(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  return { ...currentObj, ...incoming };
}

function mergePrinting(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  for (const key of ['kot', 'receipt']) {
    if (incoming[key]) {
      merged[key] = mergePrinterTarget(currentObj[key], incoming[key]);
    }
  }

  return merged;
}

function mergeFeatures(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.dineIn !== undefined) merged.dineIn = incoming.dineIn;

  return merged;
}

const updateSettings = asyncHandler(async (req, res) => {
  const {
    restaurantName,
    address,
    phone,
    taxRate,
    currency,
    receiptFooter,
    paymentProviders,
    discounts,
    rounding,
    printing,
    features,
  } = req.body;

  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }

  settings.restaurantName = restaurantName ?? settings.restaurantName;
  settings.address = address ?? settings.address;
  settings.phone = phone ?? settings.phone;
  settings.taxRate = taxRate ?? settings.taxRate;
  settings.currency = currency ?? settings.currency;
  settings.receiptFooter = receiptFooter ?? settings.receiptFooter;

  if (paymentProviders) {
    settings.paymentProviders = mergePaymentProviders(settings.paymentProviders, paymentProviders);
  }

  if (discounts) {
    settings.discounts = mergeDiscounts(settings.discounts, discounts);
  }

  if (rounding) {
    settings.rounding = mergeRounding(settings.rounding, rounding);
  }

  if (printing) {
    settings.printing = mergePrinting(settings.printing, printing);
  }

  if (features) {
    settings.features = mergeFeatures(settings.features, features);
  }

  await settings.save();
  res.json(settings);
});

module.exports = { getSettings, updateSettings };
