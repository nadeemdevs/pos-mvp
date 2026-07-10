import api from './api'

export const getOrders = (params = {}) => api.get('/orders', { params }).then((r) => r.data)

export const getOrder = (id) => api.get(`/orders/${id}`).then((r) => r.data)

export const createOrder = (data) => api.post('/orders', data).then((r) => r.data)

export const addOrderItems = (id, items) =>
  api.post(`/orders/${id}/items`, { items }).then((r) => r.data)

export const updateOrderItem = (id, itemId, data) =>
  api.put(`/orders/${id}/items/${itemId}`, data).then((r) => r.data)

export const removeOrderItem = (id, itemId) =>
  api.delete(`/orders/${id}/items/${itemId}`).then((r) => r.data)

export const sendKot = (id) => api.post(`/orders/${id}/kot`).then((r) => r.data)

export const requestBill = (id) => api.post(`/orders/${id}/request-bill`).then((r) => r.data)

export const billOrder = (id, data) => api.post(`/orders/${id}/bill`, data).then((r) => r.data)

export const cancelOrder = (id) => api.post(`/orders/${id}/cancel`).then((r) => r.data)
