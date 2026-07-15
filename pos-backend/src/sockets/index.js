const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const requestContext = require('../common/requestContext');
const tenantStatus = require('../modules/tenants/tenantStatus');

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
    cors: {
      origin:
        config.corsOrigin === '*'
          ? '*'
          : config.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    },
  });

  // JWT auth: client must connect with `auth: { token }` (same token as the
  // REST API's Authorization: Bearer header). Invalid/missing token -> the
  // connection is rejected before the 'connection' event fires.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }

    socket.user = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      permissions: payload.permissions || [],
      tenantId: payload.tenantId || 'default',
    };

    // Phase 6.2 — reject the handshake outright if the socket's tenant is
    // suspended, so a suspended restaurant can't hold a live realtime feed.
    // Already-open sockets are torn down separately by disconnectTenant()
    // when the PATCH suspends them. (Phase 6.4a: platform operators are a
    // separate identity that never connects via this tenant socket at all,
    // so there's no more "platform admin" exemption to carry here.)
    try {
      const status = await tenantStatus.getStatus(socket.user.tenantId);
      if (status === 'SUSPENDED') {
        return next(new Error('This restaurant account is suspended'));
      }
    } catch (err) {
      // fail open — getStatus already handled the error internally.
    }

    next();
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

// Phase 6.2 — force-disconnect every live socket belonging to a tenant.
// Called by PATCH /api/platform/tenants/:slug when a tenant is suspended, so
// existing realtime connections drop immediately instead of lingering until
// their next reconnect. Emits a 'suspended' event first so a well-behaved
// client can show a message before the socket closes.
function disconnectTenant(tenantId) {
  if (!io) return 0;
  let count = 0;
  for (const socket of io.of('/').sockets.values()) {
    if (socket.user && socket.user.tenantId === tenantId) {
      socket.emit('suspended', { code: 'TENANT_SUSPENDED', message: 'This restaurant account is suspended' });
      socket.disconnect(true);
      count += 1;
    }
  }
  return count;
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

module.exports = { initSocket, getIO, emitTo, disconnectTenant };
