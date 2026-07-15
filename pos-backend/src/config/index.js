require('dotenv').config();

const DEV_JWT_SECRET = 'dev-secret-change-me';
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;

// Phase 6.2 — refuse to boot in production with the well-known dev secret.
// Local dev (NODE_ENV unset/other) keeps the convenient default so nothing
// changes for the current deployment.
if (process.env.NODE_ENV === 'production' && jwtSecret === DEV_JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is still the insecure dev default while NODE_ENV=production. ' +
      'Set a strong JWT_SECRET env var before starting the server in production.'
  );
}

module.exports = {
  port: process.env.PORT || 5001,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pos_mvp',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  // CORS origin is configurable (comma-separated list or a single origin);
  // defaults to '*' so local dev keeps working unchanged.
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
