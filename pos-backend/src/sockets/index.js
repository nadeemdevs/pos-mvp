const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  // JWT auth: client must connect with `auth: { token }` (same token as the
  // REST API's Authorization: Bearer header). Invalid/missing token -> the
  // connection is rejected before the 'connection' event fires.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      socket.user = {
        id: payload.id,
        name: payload.name,
        role: payload.role,
        permissions: payload.permissions || [],
      };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const who = socket.user ? `${socket.user.name} (${socket.user.role})` : 'unknown';
    console.log(`[socket] client connected: ${socket.id} — ${who}`);

    // Everyone lands on 'floor' (tables/orders/billing events). Kitchen staff
    // (or Admin) additionally join 'kitchen' for KOT/KDS events.
    socket.join('floor');

    const canViewKitchen =
      socket.user && (socket.user.role === 'Admin' || (socket.user.permissions || []).includes('kitchen.view'));
    if (canViewKitchen) {
      socket.join('kitchen');
    }

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket(server) first.');
  }
  return io;
}

// Room-scoped emit helper for the new dine-in modules (tables/orders/kots).
// Swallows the "not initialized" error the same way payments.service's
// global emit() does, so it's safe to call from tests/scripts.
function emitTo(room, event, payload) {
  try {
    getIO().to(room).emit(event, payload);
  } catch (err) {
    // socket not initialized (e.g. in tests/scripts) — ignore
  }
}

module.exports = { initSocket, getIO, emitTo };
