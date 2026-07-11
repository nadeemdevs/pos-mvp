const express = require('express');
const controller = require('./delivery.controller');

const router = express.Router();

// No auth — vendor webhook, verified via HMAC signature instead (see
// delivery.service.handleWebhook / DeliveryProvider.verifyWebhook).
router.post('/webhook/:partner', controller.webhook);

module.exports = router;
