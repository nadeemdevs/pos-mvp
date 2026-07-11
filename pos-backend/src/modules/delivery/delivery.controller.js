const asyncHandler = require('../../common/utils/asyncHandler');
const requestContext = require('../../common/requestContext');
const Setting = require('../settings/setting.model');
const Tenant = require('../tenants/tenant.model');
const service = require('./delivery.service');

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

// POST /api/delivery/webhook/:tenantSlug/:partner — no auth (vendor webhook).
// POST /api/delivery/webhook/:partner is the legacy alias for tenant
// 'default'. Body shape and signature scheme are documented placeholders —
// see src/modules/delivery/DeliveryProvider.js.
const webhook = asyncHandler(async (req, res) => {
  const tenantSlug = req.params.tenantSlug || 'default';

  const tenant = await Tenant.findOne({ slug: tenantSlug });
  if (!tenant && tenantSlug !== 'default') {
    return res.status(404).json({ message: 'Unknown tenant' });
  }
  if (tenant && tenant.status === 'SUSPENDED') {
    return res.status(403).json({ message: 'This restaurant account is suspended' });
  }

  // Everything below (per-tenant settings/secrets, menu-item mapping, order
  // creation, counters, emits, subscribers) runs in the tenant's context.
  await requestContext.run({ tenantId: tenantSlug, branchId: 'main' }, async () => {
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
});

module.exports = { webhook };
