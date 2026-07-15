import publicApi from './publicApi'

export const getPublicMenu = () => publicApi.get('/public/menu').then((r) => r.data)

export const getPublicTable = (qrToken) =>
  publicApi.get(`/public/table/${qrToken}`).then((r) => r.data)

export const createPublicOrder = (payload) =>
  publicApi.post('/public/orders', payload).then((r) => r.data)

export const getPublicOrderStatus = (orderId, token) =>
  publicApi
    .get(`/public/orders/${orderId}/status`, { params: { token } })
    .then((r) => r.data)
