// Phase 6.1 — hard-delete a tenant and EVERY document that belongs to it
// (users, roles, settings, branches, menu, invoices, payments, tables,
// orders, audit logs, counters keyed with its tenant suffix, ...). Iterates
// every collection in the database (same approach as migrateTenant.js) so
// collections added later are covered automatically.
//
// Refuses to delete 'default' — that's the live production tenant.
//
// Usage: node scripts/deleteTenant.js <slug>   (npm run delete:tenant -- <slug>)
require('../src/common/database/tenantPlugin');
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');

async function run() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/deleteTenant.js <tenant-slug>');
    process.exit(1);
  }
  if (slug === 'default') {
    console.error('[delete:tenant] refusing to delete the "default" tenant');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  console.log(`[delete:tenant] connected: ${config.mongoUri}`);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  let total = 0;
  for (const { name, type } of collections) {
    if (type !== 'collection' || name.startsWith('system.')) continue;

    const coll = db.collection(name);

    let result;
    if (name === 'tenants') {
      // eslint-disable-next-line no-await-in-loop
      result = await coll.deleteMany({ slug });
    } else if (name === 'counters') {
      // Counters carry the tenant both in tenantId (stamped) and baked into
      // the key suffix — delete on either, so pre-stamp keys are covered too.
      // eslint-disable-next-line no-await-in-loop
      result = await coll.deleteMany({
        $or: [{ tenantId: slug }, { key: { $regex: `-${slug}(-|$)` } }],
      });
    } else {
      // eslint-disable-next-line no-await-in-loop
      result = await coll.deleteMany({ tenantId: slug });
    }

    if (result.deletedCount > 0) {
      total += result.deletedCount;
      console.log(`[delete:tenant] ${name}: deleted ${result.deletedCount}`);
    }
  }

  console.log(`[delete:tenant] done — ${total} document(s) removed for tenant "${slug}"`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[delete:tenant] failed:', err);
  process.exit(1);
});
