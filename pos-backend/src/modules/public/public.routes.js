const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../common/utils/asyncHandler');
const requestContext = require('../../common/requestContext');
const Table = require('../tables/table.model');
const Order = require('../orders/order.model');
const Tenant = require('../tenants/tenant.model');
const controller = require('./public.controller');
const service = require('./public.service');

const router = express.Router();

// No auth anywhere on this router — it's the guest-facing QR/online-ordering
// surface. Rate-limited (~60 req/min/IP) since it's reachable by anyone who
// scans a table's QR code.
//
// Phase 6.1 tenancy: there is no JWT here, so the tenant is resolved from
// the QR token itself (qrToken is globally unique — the ONE sanctioned
// unscoped lookup on this surface), or from the order being polled for
// /orders/:id/status. Once resolved, the rest of the request runs inside
// requestContext.run with THAT table's tenantId/branchId, so the menu,
// order creation and status queries are all confined to the right tenant.
// Two gates apply per tenant: the tenant must not be SUSPENDED, and its
// settings.features.onlineOrdering flag must be on.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests — please slow down' },
});

router.use(publicLimiter);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Shared tail of both context resolvers: suspended gate + onlineOrdering
// gate, then hand the request onwards inside the tenant's context.
async function runInTenantContext(req, next, ctx) {
  const tenant = await Tenant.findOne({ slug: ctx.tenantId });
  if (tenant && tenant.status === 'SUSPENDED') {
    throw httpError(403, 'This restaurant account is suspended');
  }

  req.tenantId = ctx.tenantId;
  req.branchId = ctx.branchId;

  return requestContext.run(ctx, async () => {
    const enabled = await service.isOnlineOrderingEnabled();
    if (!enabled) throw httpError(403, 'Online ordering is disabled');
    next();
  });
}

// Resolve tenant/branch from a table's QR token — taken from the route param
// (/table/:qrToken), the ?token= query (/menu) or the body (POST /orders).
const tableContext = asyncHandler(async (req, res, next) => {
  const token = req.params.qrToken || req.query.token || (req.body && req.body.qrToken);
  if (!token) throw httpError(400, 'A table QR token is required');

  const table = await Table.findOne({ qrToken: token }).setOptions({ skipTenantScope: true });
  if (!table) throw httpError(404, 'Table not found');

  await runInTenantContext(req, next, {
    tenantId: table.tenantId || 'default',
    branchId: table.branchId || 'main',
  });
});

// Resolve tenant/branch from the order being polled (GET /orders/:id/status).
// The status token itself is verified in public.service.getOrderStatus.
const orderContext = asyncHandler(async (req, res, next) => {
  let order = null;
  try {
    order = await Order.findById(req.params.id).setOptions({ skipTenantScope: true });
  } catch (err) {
    order = null; // malformed ObjectId
  }
  if (!order) throw httpError(404, 'Order not found');

  await runInTenantContext(req, next, {
    tenantId: order.tenantId || 'default',
    branchId: order.branchId || 'main',
  });
});

// GET /api/public/menu?token=<qrToken> — the token identifies whose menu to
// serve (Phase 6.1: there is no "the" menu any more).
router.get('/menu', tableContext, controller.getMenu);
router.get('/table/:qrToken', tableContext, controller.getTable);
router.post('/orders', tableContext, controller.createOrder);
router.get('/orders/:id/status', orderContext, controller.getOrderStatus);

module.exports = router;
