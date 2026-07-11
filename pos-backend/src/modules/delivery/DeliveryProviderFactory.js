const ZomatoProvider = require('./ZomatoProvider');
const SwiggyProvider = require('./SwiggyProvider');

const providers = {
  zomato: ZomatoProvider,
  swiggy: SwiggyProvider,
};

function get(partner) {
  const Provider = providers[String(partner || '').toLowerCase()];
  if (!Provider) {
    const err = new Error(`Unsupported delivery partner: ${partner}`);
    err.status = 400;
    throw err;
  }
  return new Provider();
}

module.exports = { get };
