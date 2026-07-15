const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config');
const connectDB = require('./common/database/connect');
const { initSocket } = require('./sockets');
const poller = require('./modules/payments/poller');
const subscribers = require('./subscribers');

const server = http.createServer(app);
initSocket(server);

connectDB();

// Resume polling for any card payments that were still in-flight when the
// process last stopped (e.g. a restart mid-transaction).
mongoose.connection.once('connected', () => {
  poller.resumeAll().catch((err) => {
    console.error('[poller] resumeAll failed:', err.message);
  });

  subscribers.init();
});

server.listen(config.port, () => {
  console.log(`[server] listening on port ${config.port}`);
});
