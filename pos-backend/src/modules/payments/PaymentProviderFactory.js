const ManualCashProvider = require('./providers/ManualCashProvider');
const ManualUPIProvider = require('./providers/ManualUPIProvider');
const MockTerminalProvider = require('./providers/MockTerminalProvider');
const PineLabsProvider = require('./providers/PineLabsProvider');
const WorldlineProvider = require('./providers/WorldlineProvider');

const providers = {
  CASH: ManualCashProvider,
  UPI: ManualUPIProvider,
  MOCK: MockTerminalProvider,
  PINELABS: PineLabsProvider,
  WORLDLINE: WorldlineProvider,
};

function get(method) {
  const Provider = providers[method];
  if (!Provider) {
    const err = new Error(`Unsupported payment method: ${method}`);
    err.status = 400;
    throw err;
  }
  return new Provider();
}

module.exports = { get };
