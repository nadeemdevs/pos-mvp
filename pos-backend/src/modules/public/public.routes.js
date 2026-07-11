const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../common/utils/asyncHandler');
const controller = require('./public.controller');
const service = require('./public.service');

const router = express.Router();

// No auth anywhere on this router — it's the guest-facing QR/online-ordering
// surface. Rate-limited (~60 req/min/IP) since it's reachable by anyone who
// scans a table's QR code, and gated behind settings.features.onlineOrdering
// so a restaurant that hasn't rolled this out yet doesn't expose menu data.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests — please slow down' },
});

router.use(publicLimiter);

const requireOnlineOrdering = asyncHandler(async (req, res, next) => {
  const enabled = await service.isOnlineOrderingEnabled();
  if (!enabled) {
    return res.status(403).json({ message: 'Online ordering is disabled' });
  }
  next();
});

router.use(requireOnlineOrdering);

router.get('/menu', controller.getMenu);
router.get('/table/:qrToken', controller.getTable);
router.post('/orders', controller.createOrder);
router.get('/orders/:id/status', controller.getOrderStatus);

module.exports = router;
