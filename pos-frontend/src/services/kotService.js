import api from './api'

export const getKots = (params = {}) => api.get('/kots', { params }).then((r) => r.data)

export const updateKotStatus = (id, status) =>
  api.post(`/kots/${id}/status`, { status }).then((r) => r.data)

export const printKot = (id) => api.get(`/kots/${id}/print`).then((r) => r.data)
