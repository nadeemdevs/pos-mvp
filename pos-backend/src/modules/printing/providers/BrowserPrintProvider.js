const PrinterProvider = require('../PrinterProvider');

// Default provider: no physical printer configured, so the client (browser)
// does the actual printing — we just hand back a formatted payload.
class BrowserPrintProvider extends PrinterProvider {
  // eslint-disable-next-line no-unused-vars
  async print(payload, config) {
    return { printed: false, payload };
  }
}

module.exports = BrowserPrintProvider;
