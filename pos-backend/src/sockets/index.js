const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const requestContext = require('../common/requestContext');

let io = null;

// Phase 6.1 — rooms are tenant-scoped: `floor:<tenantId>` / `kitchen:<tenantId>`.
// Clients join their own tenant's rooms (tenantId comes from the JWT), and
// every emitTo() call site publishes to the caller's tenant rooms (derived
// from the AsyncLocalStorage request context; fallback 'default' for
// pre-6.1 tokens / contexts).
function tenantRoom(room, tenantId) {
  return `${room}:${tenantId || 'default'}`;
}

function currentTenantId() {
  const ctx = requestContext.get();
  return ctx && ctx.tenantId ? ctx.tenantId : 'default';
}

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
        tenantId: payload.tenantId || 'default',
      };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const who = socket.user ? `${socket.user.name} (${socket.user.role})` : 'unknown';
    const tenantId = (socket.user && socket.user.tenantId) || 'default';
    console.log(`[socket] client connected: ${socket.id} — ${who} [tenant: ${tenantId}]`);

    // Everyone lands on their tenant's 'floor' (tables/orders/billing
    // events). Kitchen staff (or Admin) additionally join their tenant's
    // 'kitchen' for KOT/KDS events.
    socket.join(tenantRoom('floor', tenantId));

    const canViewKitchen =
      socket.user && (socket.user.role === 'Admin' || (socket.user.permissions || []).includes('kitchen.view'));
    if (canViewKitchen) {
      socket.join(tenantRoom('kitchen', tenantId));
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

// Room-scoped emit helper. Callers keep passing the logical room name
// ('floor'/'kitchen') — the current tenant is appended automatically from
// the request context. Swallows the "not initialized" error so it's safe
// to call from tests/scripts.
function emitTo(room, event, payload) {
  try {
    getIO().to(tenantRoom(room, currentTenantId())).emit(event, payload);
  } catch (err) {
    // socket not initialized (e.g. in tests/scripts) — ignore
  }
}

module.exports = { initSocket, getIO, emitTo };
