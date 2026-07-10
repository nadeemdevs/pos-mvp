import { io } from 'socket.io-client'

// Singleton socket.io client. Connected lazily after login (and reconnected
// whenever the auth token changes) via authStore's login/logout actions —
// see src/store/authStore.js. Do not import authStore here to avoid a
// circular dependency; callers pass the token explicitly.
let socket = null
let currentToken = null

export function getSocket() {
  return socket
}

export function connectSocket(token) {
  if (!token) return null

  if (socket && currentToken === token) {
    if (!socket.connected) socket.connect()
    return socket
  }

  disconnectSocket()

  currentToken = token
  socket = io(window.location.origin, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  socket = null
  currentToken = null
}
