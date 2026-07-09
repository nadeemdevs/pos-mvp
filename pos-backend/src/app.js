const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { notFound, errorHandler } = require('./common/middleware/error');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const categoriesRoutes = require('./modules/menu/categories.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const billingRoutes = require('./modules/billing/billing.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const settingsRoutes = require('./modules/settings/settings.routes');

const app = express();

app.use(helmet());
app.use(cors());
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
