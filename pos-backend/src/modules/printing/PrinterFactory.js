const BrowserPrintProvider = require('./providers/BrowserPrintProvider');
const EscPosNetworkProvider = require('./providers/EscPosNetworkProvider');

const providers = {
  BROWSER: BrowserPrintProvider,
  ESCPOS_NETWORK: EscPosNetworkProvider,
};

function get(providerKey) {
  const Provider = providers[providerKey] || BrowserPrintProvider;
  return new Provider();
}

module.exports = { get };
