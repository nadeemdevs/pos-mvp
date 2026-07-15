// One-off (but idempotent, safe to re-run) migration: backfills tenantId /
// branchId on every document that predates the tenantPlugin. Iterates every
// collection in the connected database rather than an explicit list of
// models, so it also covers collections that get added later without this
// script needing an update.
//
// Usage: npm run migrate:tenant
require('./tenantPlugin'); // harmless here — no models are loaded by this script
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../../config');

const SKIP_COLLECTIONS = new Set([
  // Nothing to skip today, but keep the door open for view-only or
  // system collections that shouldn't be touched.
]);

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(`[migrate:tenant] connected: ${config.mongoUri}`);

  const collections = await mongoose.connection.db.listCollections().toArray();

  let totalMatched = 0;
  let totalModified = 0;

  for (const { name, type } of collections) {
    if (type !== 'collection' || SKIP_COLLECTIONS.has(name) || name.startsWith('system.')) {
      continue;
    }

    const collection = mongoose.connection.db.collection(name);
    // eslint-disable-next-line no-await-in-loop
    const result = await collection.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: 'default', branchId: 'main' } }
    );

    if (result.matchedCount > 0) {
      console.log(`[migrate:tenant] ${name}: matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    }

    totalMatched += result.matchedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[migrate:tenant] done — matched ${totalMatched}, modified ${totalModified} documents across ${collections.length} collections`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[migrate:tenant] failed:', err);
  process.exit(1);
});
