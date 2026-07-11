const asyncHandler = require('../../common/utils/asyncHandler');
const Setting = require('../settings/setting.model');
const service = require('./delivery.service');

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

// POST /api/delivery/webhook/:partner — no auth (vendor webhook). Body shape
// and signature scheme are documented placeholders — see
// src/modules/delivery/DeliveryProvider.js.
const webhook = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const result = await service.handleWebhook(req.params.partner, req.body, settings, req);

  if (result.cancelled) {
    return res.status(200).json({ message: 'Order cancelled', order: result.order });
  }

  res.status(result.created ? 201 : 200).json({
    message: result.created ? 'Order created' : 'Order already exists (idempotent replay)',
    order: result.order,
  });
});

module.exports = { webhook };
