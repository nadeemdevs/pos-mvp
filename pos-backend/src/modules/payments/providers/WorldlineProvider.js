const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

// -----------------------------------------------------------------------------
// CONFIG BLOCK — everything vendor-endpoint-shaped lives here so it's easy to fix.
//
// NOTE: These paths and the callback header name are illustrative placeholders
// modeled on common Worldline India (formerly Ingenico) terminal-integration
// patterns (POST a sale/status/cancel request, HMAC-signed, terminal calls back
// to a merchant webhook with a signature header). Worldline does not publish one
// canonical public spec — CONFIRM the exact paths, field names, and signature
// construction against your merchant's actual Worldline integration document
// before relying on this in production.
// -----------------------------------------------------------------------------
const CONFIG = {
  paths: {
    initiate: '/txn/v1/sale',
    status: '/txn/v1/status',
    cancel: '/txn/v1/cancel',
  },
  signatureHeader: 'x-worldline-signature',
  signatureAlgo: 'sha512',
};

function sign(secret, payload) {
  return crypto.createHmac(CONFIG.signatureAlgo, secret || '').update(payload).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function postJson(url, body, secret) {
  const payload = JSON.stringify(body);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [CONFIG.signatureHeader]: sign(secret, payload),
    },
    body: payload,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

class WorldlineProvider extends PaymentProvider {
  async initiatePayment(invoice, payment, config) {
    const cfg = (config && config.worldline) || {};
    const body = {
      merchantCode: cfg.merchantCode,
      terminalId: cfg.terminalId,
      txnRef: String(payment._id),
      amount: Math.round(invoice.total * 100), // paise
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${CONFIG.paths.initiate}`, body, cfg.securityToken);
      if (!ok) {
        console.error('[WorldlineProvider] initiate non-200 response', status, data);
        return {
          reference: `WORLDLINE-${payment._id}`,
          status: 'PROCESSING',
          rawResponse: { requestBody: body, httpStatus: status, responseBody: data },
        };
      }

      const reference = data.transactionId || data.txnId || `WORLDLINE-${payment._id}`;
      return { reference, status: 'PROCESSING', rawResponse: { requestBody: body, responseBody: data } };
    } catch (err) {
      console.error('[WorldlineProvider] initiate request failed:', err.message);
      return {
        reference: `WORLDLINE-${payment._id}`,
        status: 'PROCESSING',
        rawResponse: { requestBody: body, error: err.message },
      };
    }
  }

  async getStatus(payment, config) {
    const cfg = (config && config.worldline) || {};
    const body = {
      merchantCode: cfg.merchantCode,
      terminalId: cfg.terminalId,
      txnRef: String(payment._id),
      transactionId: payment.reference,
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${CONFIG.paths.status}`, body, cfg.securityToken);
      if (!ok) {
        console.error('[WorldlineProvider] getStatus non-200 response', status, data);
        return { status: 'PROCESSING', rawResponse: { requestBody: body, httpStatus: status, responseBody: data } };
      }

      const txnStatus = String(data.status || '').toUpperCase();
      let mapped = 'PROCESSING';
      if (['SUCCESS', 'APPROVED', 'CAPTURED'].includes(txnStatus)) mapped = 'SUCCESS';
      else if (['FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'ERROR'].includes(txnStatus)) mapped = 'FAILED';

      const result = { status: mapped, rawResponse: { requestBody: body, responseBody: data } };

      if (mapped === 'SUCCESS' && data.card) {
        result.cardDetails = {
          maskedPan: data.card.maskedPan,
          authCode: data.card.authCode,
          cardType: data.card.cardType,
        };
      }
      if (mapped === 'FAILED') {
        result.failureReason = data.message || 'Declined by terminal';
      }

      return result;
    } catch (err) {
      console.error('[WorldlineProvider] getStatus request failed:', err.message);
      return { status: 'PROCESSING', rawResponse: { requestBody: body, error: err.message } };
    }
  }

  async cancelPayment(payment, config) {
    const cfg = (config && config.worldline) || {};
    const body = {
      merchantCode: cfg.merchantCode,
      terminalId: cfg.terminalId,
      txnRef: String(payment._id),
      transactionId: payment.reference,
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${CONFIG.paths.cancel}`, body, cfg.securityToken);
      if (!ok) {
        console.error('[WorldlineProvider] cancel non-200 response', status, data);
      }
      return { status: 'CANCELLED', rawResponse: { requestBody: body, responseBody: data } };
    } catch (err) {
      console.error('[WorldlineProvider] cancel request failed:', err.message);
      return { status: 'CANCELLED', rawResponse: { requestBody: body, error: err.message } };
    }
  }

  // Verifies the HMAC signature Worldline is expected to send on its webhook
  // callback (x-worldline-signature: HMAC-SHA512(rawBody, securityToken)).
  // Requires req.rawBody (captured by the express.json() verify hook in app.js)
  // since JSON.stringify(req.body) is not guaranteed to reproduce the exact bytes
  // the vendor signed.
  verifyCallback(req, config) {
    const cfg = (config && config.worldline) || {};
    const signature = req.headers[CONFIG.signatureHeader];
    if (!signature) return false;

    const payload = req.rawBody !== undefined ? req.rawBody : JSON.stringify(req.body || {});
    const expected = sign(cfg.securityToken, payload);
    return timingSafeEqualHex(signature, expected);
  }
}

module.exports = WorldlineProvider;
