import publicApi from './publicApi'

// The token scopes the request to the right tenant/branch — /public/menu
// responds 400 without it (see backend public.routes.js tableContext).
export const getPublicMenu = (qrToken) =>
  publicApi.get('/public/menu', { params: { token: qrToken } }).then((r) => r.data)

export const getPublicTable = (qrToken) =>
  publicApi.get(`/public/table/${qrToken}`).then((r) => r.data)

export const createPublicOrder = (payload) =>
  publicApi.post('/public/orders', payload).then((r) => r.data)

export const getPublicOrderStatus = (orderId, token) =>
  publicApi
    .get(`/public/orders/${orderId}/status`, { params: { token } })
    .then((r) => r.data)
