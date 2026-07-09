class PaymentProvider {
  // --- Manual (cash/UPI) flow — unchanged, used by POST /api/payments/manual ---
  // eslint-disable-next-line no-unused-vars
  async processManual(invoice, { amount, reference }) {
    throw new Error('Not implemented');
  }

  // --- Card-terminal lifecycle (Phase 2) ---

  /**
   * Kick off a card-terminal transaction.
   * @returns {Promise<{reference: string, status: string, rawResponse: any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async initiatePayment(invoice, payment, config) {
    throw new Error('Not implemented');
  }

  /**
   * Poll the vendor for the current state of a previously-initiated transaction.
   * @returns {Promise<{status: string, rawResponse: any, cardDetails?: object, failureReason?: string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async getStatus(payment, config) {
    throw new Error('Not implemented');
  }

  /**
   * Ask the vendor to cancel/void an in-flight transaction (best-effort).
   * @returns {Promise<{status: string, rawResponse: any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async cancelPayment(payment, config) {
    throw new Error('Not implemented');
  }

  /**
   * Verify an inbound webhook's signature/checksum against merchant config.
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  verifyCallback(req, config) {
    throw new Error('Not implemented');
  }
}

module.exports = PaymentProvider;
