const http = require('http');
const app = require('./app');
const config = require('./config');
const connectDB = require('./common/database/connect');
const { initSocket } = require('./sockets');

const server = http.createServer(app);
initSocket(server);

connectDB();

server.listen(config.port, () => {
  console.log(`[server] listening on port ${config.port}`);
});
