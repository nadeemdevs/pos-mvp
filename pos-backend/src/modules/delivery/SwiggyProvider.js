const DeliveryProvider = require('./DeliveryProvider');

// Placeholder — pending Swiggy's real partner-integration document. See
// DeliveryProvider for the generic verifyWebhook/mapOrder assumptions this
// class inherits unchanged; only the settings key ('swiggy') differs from
// ZomatoProvider.
class SwiggyProvider extends DeliveryProvider {
  constructor() {
    super('swiggy');
  }
}

module.exports = SwiggyProvider;
