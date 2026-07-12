// Phase 6.4a — one-off (but idempotent, safe to re-run) migration: unsets the
// retired `platformAdmin` field from every user document, cross-tenant. The
// platform-operator capability now lives entirely in the separate
// PlatformOperator collection (see platformOperator.model.js) — no tenant
// User should carry this flag anymore.
//
// Usage: node src/common/database/migrateRemovePlatformAdmin.js
//        (npm run migrate:remove-platform-admin)
require('./tenantPlugin'); // harmless here — no models are loaded by this script
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../../config');

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(`[migrate:remove-platform-admin] connected: ${config.mongoUri}`);

  // Raw collection access (not the User model) — deliberately skips any
  // tenant-scoping hooks, since this must reach across EVERY tenant.
  const users = mongoose.connection.db.collection('users');

  const result = await users.updateMany(
    { platformAdmin: { $exists: true } },
    { $unset: { platformAdmin: '' } }
  );

  console.log(
    `[migrate:remove-platform-admin] matched ${result.matchedCount}, modified ${result.modifiedCount}`
  );
  console.log('[migrate:remove-platform-admin] done');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[migrate:remove-platform-admin] failed:', err);
  process.exit(1);
});
