// Phase 6.1 index migration — converts the single-tenant unique indexes to
// per-tenant compound uniques. Idempotent: checks the ACTUAL existing
// indexes via listIndexes before touching anything, so re-running is a
// no-op. users.email deliberately stays GLOBALLY unique (login resolves a
// user across tenants by email alone).
//
// Usage: npm run migrate:tenant-indexes
require('./tenantPlugin'); // harmless — no models loaded by this script
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../../config');

// { collection, drop: [index names or key-matchers], create: [{ keys, options }] }
const MIGRATIONS = [
  {
    collection: 'roles',
    drop: [{ name: 1 }],
    create: [{ keys: { tenantId: 1, name: 1 }, options: { unique: true } }],
  },
  {
    collection: 'customers',
    drop: [{ phone: 1 }],
    create: [{ keys: { tenantId: 1, phone: 1 }, options: { unique: true } }],
  },
  {
    collection: 'tables',
    drop: [{ name: 1 }],
    create: [{ keys: { tenantId: 1, branchId: 1, name: 1 }, options: { unique: true } }],
  },
  {
    collection: 'branches',
    drop: [{ code: 1 }],
    create: [{ keys: { tenantId: 1, code: 1 }, options: { unique: true } }],
  },
  {
    collection: 'settings',
    drop: [],
    create: [{ keys: { tenantId: 1 }, options: { unique: true } }],
  },
  {
    collection: 'categories',
    drop: [{ name: 1 }],
    create: [{ keys: { tenantId: 1, name: 1 }, options: { unique: true } }],
  },
  // menuitems: no single-field unique name/sku index exists (verified via
  // listIndexes) — nothing to migrate.
  // inventoryitems: already (tenantId, branchId, name) unique — verified,
  // left as-is.
];

function sameKeys(a, b) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
}

async function migrateCollection(db, { collection, drop, create }) {
  const collections = await db.listCollections({ name: collection }).toArray();
  if (!collections.length) {
    console.log(`[migrate:tenant-indexes] ${collection}: collection missing — skipped`);
    return;
  }

  const coll = db.collection(collection);
  const existing = await coll.listIndexes().toArray();

  for (const keysToDrop of drop) {
    const found = existing.find((ix) => sameKeys(ix.key, keysToDrop) && ix.unique);
    if (found) {
      await coll.dropIndex(found.name);
      console.log(`[migrate:tenant-indexes] ${collection}: dropped unique index ${found.name}`);
    }
  }

  for (const { keys, options } of create) {
    const found = existing.find((ix) => sameKeys(ix.key, keys));
    if (found) {
      if (found.unique) {
        console.log(`[migrate:tenant-indexes] ${collection}: ${found.name} already present — ok`);
        continue;
      }
      // Same keys but not unique (e.g. the plugin's plain tenantId index on
      // settings) — replace it with the unique version.
      await coll.dropIndex(found.name);
      console.log(`[migrate:tenant-indexes] ${collection}: dropped non-unique ${found.name} to recreate as unique`);
    }
    const name = await coll.createIndex(keys, { ...options });
    console.log(`[migrate:tenant-indexes] ${collection}: created ${name} ${JSON.stringify(keys)} (unique)`);
  }
}

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(`[migrate:tenant-indexes] connected: ${config.mongoUri}`);

  const db = mongoose.connection.db;
  for (const migration of MIGRATIONS) {
    // eslint-disable-next-line no-await-in-loop
    await migrateCollection(db, migration);
  }

  console.log('[migrate:tenant-indexes] done');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[migrate:tenant-indexes] failed:', err);
  process.exit(1);
});
