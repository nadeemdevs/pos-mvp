const mongoose = require('mongoose');
const config = require('../../config');

const RETRY_DELAY_MS = 5000;

async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log(`[db] connected: ${config.mongoUri}`);
  } catch (err) {
    console.error(`[db] connection failed: ${err.message}`);
    console.log(`[db] retrying in ${RETRY_DELAY_MS / 1000}s...`);
    setTimeout(connectDB, RETRY_DELAY_MS);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[db] disconnected');
});

module.exports = connectDB;
