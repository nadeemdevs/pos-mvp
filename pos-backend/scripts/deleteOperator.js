// Phase 6.4a — hard-delete a PlatformOperator, mirroring deleteTenant.js's
// style (connect, act, log, disconnect).
//
// Usage: node scripts/deleteOperator.js <email>   (npm run delete-operator -- <email>)
require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const PlatformOperator = require('../src/modules/platform/platformOperator.model');

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/deleteOperator.js <email>');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  console.log(`[delete-operator] connected: ${config.mongoUri}`);

  const result = await PlatformOperator.deleteOne({ email: String(email).toLowerCase().trim() });

  if (result.deletedCount > 0) {
    console.log(`[delete-operator] deleted operator: ${email}`);
  } else {
    console.log(`[delete-operator] no operator found with email: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[delete-operator] failed:', err);
  process.exit(1);
});
