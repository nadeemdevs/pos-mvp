import api from './api'

export const getVendors = (params = {}) =>
  api.get('/vendors', { params }).then((r) => r.data)

export const createVendor = (data) => api.post('/vendors', data).then((r) => r.data)

export const updateVendor = (id, data) =>
  api.put(`/vendors/${id}`, data).then((r) => r.data)

export const deleteVendor = (id) => api.delete(`/vendors/${id}`).then((r) => r.data)
