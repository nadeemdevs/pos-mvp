const DeliveryProvider = require('./DeliveryProvider');

// Placeholder — pending Zomato's real partner-integration document. See
// DeliveryProvider for the generic verifyWebhook/mapOrder assumptions this
// class inherits unchanged; only the settings key ('zomato') differs from
// SwiggyProvider.
class ZomatoProvider extends DeliveryProvider {
  constructor() {
    super('zomato');
  }
}

module.exports = ZomatoProvider;
