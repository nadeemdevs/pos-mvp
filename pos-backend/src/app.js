// MUST be the first require in the app — registers the global tenantId/
// branchId mongoose plugin before any model file below gets required (every
// require of a *.routes.js pulls in its controller -> service -> model
// chain). See src/common/database/tenantPlugin.js for why order matters.
require('./common/database/tenantPlugin');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { notFound, errorHandler } = require('./common/middleware/error');
const tenantContext = require('./common/middleware/tenantContext');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const categoriesRoutes = require('./modules/menu/categories.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const billingRoutes = require('./modules/billing/billing.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const tablesRoutes = require('./modules/tables/tables.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const kotsRoutes = require('./modules/kots/kots.routes');
const printingRoutes = require('./modules/printing/printing.routes');
const branchesRoutes = require('./modules/branches/branches.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const vendorsRoutes = require('./modules/purchasing/vendors.routes');
const purchaseOrdersRoutes = require('./modules/purchasing/purchasing.routes');
const loyaltyRoutes = require('./modules/loyalty/loyalty.routes');
const reservationsRoutes = require('./modules/reservations/reservations.routes');
const shiftsRoutes = require('./modules/shifts/shifts.routes');
const approvalsRoutes = require('./modules/approvals/approvals.routes');
const publicRoutes = require('./modules/public/public.routes');
const deliveryRoutes = require('./modules/delivery/delivery.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const platformRoutes = require('./modules/platform/platform.routes');

const app = express();

app.use(helmet());
// CORS origin is env-configurable (CORS_ORIGIN); '*' in dev. A comma-separated
// list becomes an array of allowed origins.
const corsOrigin =
  config.corsOrigin === '*'
    ? '*'
    : config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));
// Capture the raw request body alongside the parsed one — needed by webhook
// signature verification (e.g. WorldlineProvider.verifyCallback), since
// JSON.stringify(req.body) doesn't reliably reproduce the exact bytes a vendor
// signed (key ordering, whitespace, etc).
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(morgan('dev'));

// Sets req.tenantId/req.branchId with 'default'/'main' defaults for every
// request (including unauthenticated ones). Since requireAuth is mounted
// per-router rather than globally, the new tenant-aware routers
// (branches/inventory/purchasing) re-apply this middleware after their own
// router.use(requireAuth) so req.user is available when it runs there too —
// see common/middleware/tenantContext.js.
app.use(tenantContext);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/invoice', billingRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/kots', kotsRoutes);
app.use('/api/print', printingRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/approvals', approvalsRoutes);
// Phase 5.3 — no requireAuth on these two: /api/public/* is the guest-facing
// QR/online-ordering surface (own rate limiter + settings.features.onlineOrdering
// gate, see public.routes.js); /api/delivery/webhook/:partner is a vendor
// webhook authenticated via HMAC signature instead of a JWT.
app.use('/api/public', publicRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/analytics', analyticsRoutes);
// Phase 6.4a — cross-tenant platform-operator surface. Gated entirely by
// requirePlatformAuth inside the router (a separate operator identity/token
// scope, NOT requireAuth/tenant users) — see requirePlatformAuth.js.
app.use('/api/platform', platformRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
