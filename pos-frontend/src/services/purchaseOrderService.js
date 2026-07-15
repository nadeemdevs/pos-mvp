import api from './api'

export const getPurchaseOrders = (params = {}) =>
  api.get('/purchase-orders', { params }).then((r) => r.data)

export const createPurchaseOrder = (data) =>
  api.post('/purchase-orders', data).then((r) => r.data)

export const updatePurchaseOrder = (id, data) =>
  api.put(`/purchase-orders/${id}`, data).then((r) => r.data)

export const placePurchaseOrder = (id) =>
  api.post(`/purchase-orders/${id}/place`).then((r) => r.data)

export const cancelPurchaseOrder = (id) =>
  api.post(`/purchase-orders/${id}/cancel`).then((r) => r.data)

export const receivePurchaseOrder = (id, data) =>
  api.post(`/purchase-orders/${id}/receive`, data).then((r) => r.data)
