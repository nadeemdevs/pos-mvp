import api from './api'

export const getInventoryItems = (params = {}) =>
  api.get('/inventory', { params }).then((r) => r.data)

export const createInventoryItem = (data) =>
  api.post('/inventory', data).then((r) => r.data)

export const updateInventoryItem = (id, data) =>
  api.put(`/inventory/${id}`, data).then((r) => r.data)

export const deleteInventoryItem = (id) =>
  api.delete(`/inventory/${id}`).then((r) => r.data)

export const adjustInventoryItem = (id, data) =>
  api.post(`/inventory/${id}/adjust`, data).then((r) => r.data)

export const getInventoryLedger = (id, params = {}) =>
  api.get(`/inventory/${id}/ledger`, { params }).then((r) => r.data)

export const getLowStockItems = () => api.get('/inventory/low').then((r) => r.data)
