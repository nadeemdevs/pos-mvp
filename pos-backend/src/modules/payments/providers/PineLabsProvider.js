const PaymentProvider = require('./PaymentProvider');

// Plutus Smart / "Cloud Based Integration" API (Pine Labs). Paths per the merchant
// integration guide for that product line — confirm against your merchant's actual
// onboarding doc if these ever drift.
const ENDPOINTS = {
  upload: '/API/CloudBasedIntegration/V1/UploadBilledTransaction',
  status: '/API/CloudBasedIntegration/V1/GetCloudBasedTxnStatus',
  cancel: '/API/CloudBasedIntegration/V1/CancelTransaction',
};

// TxnStatus values returned by GetCloudBasedTxnStatus. Only the well-known values
// are mapped explicitly; anything else is treated as still-processing so the poller
// keeps retrying instead of us guessing wrong and closing out a live transaction.
const SUCCESS_CODES = new Set(['0', '1', 'SUCCESS', 'APPROVED', 'CAPTURED']);
const FAILED_CODES = new Set(['2', '3', 'FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'ERROR']);

function buildSequenceNumber() {
  return Date.now().toString().slice(-9);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

class PineLabsProvider extends PaymentProvider {
  async initiatePayment(invoice, payment, config) {
    const cfg = (config && config.pinelabs) || {};
    const sequenceNumber = buildSequenceNumber();
    const body = {
      TransactionNumber: String(payment._id),
      SequenceNumber: sequenceNumber,
      AllowedPaymentMode: '1',
      MerchantID: cfg.merchantId,
      SecurityToken: cfg.securityToken,
      IMEI: cfg.imei,
      StoreID: cfg.storeId,
      ClientID: cfg.clientId,
      Amount: Math.round(invoice.total * 100), // paise
      UserID: (payment.receivedBy && payment.receivedBy.name) || 'pos',
      AutoCancelDurationInMinutes: 5,
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${ENDPOINTS.upload}`, body);
      if (!ok) {
        console.error('[PineLabsProvider] initiate non-200 response', status, data);
        return {
          reference: `PINELABS-${payment._id}`,
          status: 'PROCESSING',
          rawResponse: { requestBody: body, httpStatus: status, responseBody: data },
        };
      }

      const reference = data.PlutusTransactionReferenceID || `PINELABS-${payment._id}`;
      return {
        reference,
        status: 'PROCESSING',
        rawResponse: { requestBody: body, responseBody: data },
      };
    } catch (err) {
      console.error('[PineLabsProvider] initiate request failed:', err.message);
      return {
        reference: `PINELABS-${payment._id}`,
        status: 'PROCESSING',
        rawResponse: { requestBody: body, error: err.message },
      };
    }
  }

  async getStatus(payment, config) {
    const cfg = (config && config.pinelabs) || {};
    const priorRequest = (payment.rawResponse && payment.rawResponse.requestBody) || {};
    const body = {
      TransactionNumber: String(payment._id),
      SequenceNumber: priorRequest.SequenceNumber || buildSequenceNumber(),
      MerchantID: cfg.merchantId,
      SecurityToken: cfg.securityToken,
      StoreID: cfg.storeId,
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${ENDPOINTS.status}`, body);
      if (!ok) {
        console.error('[PineLabsProvider] getStatus non-200 response', status, data);
        return { status: 'PROCESSING', rawResponse: { requestBody: body, httpStatus: status, responseBody: data } };
      }

      if (data.ResponseCode !== undefined && String(data.ResponseCode) !== '0') {
        // Non-zero ResponseCode usually means the status *request* was rejected
        // (bad auth/params), not that the card transaction itself failed.
        return { status: 'PROCESSING', rawResponse: { requestBody: body, responseBody: data } };
      }

      const txnStatus = String(data.TxnStatus ?? '').toUpperCase();
      let mapped = 'PROCESSING';
      if (SUCCESS_CODES.has(txnStatus)) mapped = 'SUCCESS';
      else if (FAILED_CODES.has(txnStatus)) mapped = 'FAILED';

      const result = { status: mapped, rawResponse: { requestBody: body, responseBody: data } };

      if (mapped === 'SUCCESS' && data.TransactionData) {
        const td = data.TransactionData;
        result.cardDetails = {
          maskedPan: td.CardNumber || td.MaskedCardNumber,
          authCode: td.AuthCode || td.ApprovalCode,
          cardType: td.CardType || td.CardScheme,
        };
      }
      if (mapped === 'FAILED') {
        result.failureReason = data.TxnStatusDescription || data.ErrorMessage || 'Declined by terminal';
      }

      return result;
    } catch (err) {
      console.error('[PineLabsProvider] getStatus request failed:', err.message);
      return { status: 'PROCESSING', rawResponse: { requestBody: body, error: err.message } };
    }
  }

  async cancelPayment(payment, config) {
    const cfg = (config && config.pinelabs) || {};
    const priorRequest = (payment.rawResponse && payment.rawResponse.requestBody) || {};
    const body = {
      TransactionNumber: String(payment._id),
      SequenceNumber: priorRequest.SequenceNumber || buildSequenceNumber(),
      MerchantID: cfg.merchantId,
      SecurityToken: cfg.securityToken,
      StoreID: cfg.storeId,
    };

    try {
      const { ok, status, data } = await postJson(`${cfg.baseUrl}${ENDPOINTS.cancel}`, body);
      if (!ok) {
        console.error('[PineLabsProvider] cancel non-200 response', status, data);
      }
      return { status: 'CANCELLED', rawResponse: { requestBody: body, responseBody: data } };
    } catch (err) {
      console.error('[PineLabsProvider] cancel request failed:', err.message);
      return { status: 'CANCELLED', rawResponse: { requestBody: body, error: err.message } };
    }
  }

  // Pine Labs' Cloud Based Integration API is poll-based (no merchant-side webhook
  // in this product line), so there is no signed callback to verify. Left
  // unimplemented deliberately — POST /api/payments/callback/PINELABS will 501.
}

module.exports = PineLabsProvider;
