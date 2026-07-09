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

const updateSettings = asyncHandler(async (req, res) => {
  const { restaurantName, address, phone, taxRate, currency, receiptFooter, paymentProviders } = req.body;

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

  await settings.save();
  res.json(settings);
});

module.exports = { getSettings, updateSettings };
