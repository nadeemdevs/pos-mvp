const Setting = require('./setting.model');
const asyncHandler = require('../../common/utils/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }
  res.json(settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const { restaurantName, address, phone, taxRate, currency, receiptFooter } = req.body;

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

  await settings.save();
  res.json(settings);
});

module.exports = { getSettings, updateSettings };
