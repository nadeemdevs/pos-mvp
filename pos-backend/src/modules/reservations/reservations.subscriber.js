const { subscribe } = require('../../common/eventBus');
const reservationsService = require('./reservations.service');

async function handleOrderCompleted({ order } = {}) {
  if (!order || !order._id) return;
  try {
    await reservationsService.completeByOrderId(order._id);
  } catch (err) {
    console.error('[reservations] order.completed handler failed:', err.message);
  }
}

function register() {
  subscribe('order.completed', handleOrderCompleted);
}

module.exports = { register };
