const crypto = require('crypto');
const { mapOrderItems } = require('./mapping');

// Base class mirroring the payments module's PaymentProvider pattern
// (src/modules/payments/providers/PaymentProvider.js). Unlike the payment
// providers (whose vendor APIs genuinely differ), Zomato and Swiggy don't yet
// have a documented public webhook contract for this integration, so both
// concrete subclasses (ZomatoProvider/SwiggyProvider) simply parameterize
// this SAME generic implementation with their own settings key
// ('zomato'/'swiggy') — everything below is a clearly-marked placeholder,
// pending each partner's actual integration document.
//
// Assumed generic webhook payload shape:
//   {
//     externalId: string,                 // partner's own order id — idempotency key
//     event?: 'cancelled',                // present only on a cancellation webhook
//     customer: { name, phone },
//     items: [{ sku?, name, qty, note? }],
//   }
// Assumed signature scheme: header `x-webhook-signature` = HMAC-SHA256(rawBody, secret).
class DeliveryProvider {
  constructor(partnerKey) {
    this.partnerKey = partnerKey;
  }

  // eslint-disable-next-line no-unused-vars
  verifyWebhook(req, config) {
    const cfg = (config && config.delivery && config.delivery[this.partnerKey]) || {};
    const signature = req.headers['x-webhook-signature'];
    if (!signature || !cfg.secret) return false;

    const rawBody = req.rawBody !== undefined ? req.rawBody : JSON.stringify(req.body || {});
    const expected = crypto.createHmac('sha256', cfg.secret).update(rawBody).digest('hex');

    const provided = Buffer.from(String(signature));
    const expectedBuf = Buffer.from(expected);
    if (provided.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(provided, expectedBuf);
  }

  // eslint-disable-next-line no-unused-vars
  async mapOrder(payload) {
    const { externalId, customer, items = [] } = payload || {};
    const { lines, unmatched } = await mapOrderItems(items);
    return { externalId, customer, lines, unmatched };
  }
}

module.exports = DeliveryProvider;
