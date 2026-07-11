const express = require('express');
const controller = require('./delivery.controller');

const router = express.Router();

// No auth — vendor webhook, verified via HMAC signature instead (see
// delivery.service.handleWebhook / DeliveryProvider.verifyWebhook).
//
// Phase 6.1: the canonical path carries the tenant slug so the webhook can
// resolve which tenant's settings/secrets/menu to use:
//   POST /api/delivery/webhook/:tenantSlug/:partner
// The old single-segment path stays working as an alias for the 'default'
// tenant (existing partner configurations keep functioning unchanged).
router.post('/webhook/:tenantSlug/:partner', controller.webhook);
router.post('/webhook/:partner', controller.webhook);

module.exports = router;
