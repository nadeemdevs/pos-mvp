import api from './api'

export const openShift = (data) => api.post('/shifts/open', data).then((r) => r.data)

export const getCurrentShift = () => api.get('/shifts/current').then((r) => r.data)

export const addShiftMovement = (id, data) =>
  api.post(`/shifts/${id}/movement`, data).then((r) => r.data)

export const closeShift = (id, data) =>
  api.post(`/shifts/${id}/close`, data).then((r) => r.data)

export const getShifts = (params = {}) => api.get('/shifts', { params }).then((r) => r.data)

export const getShift = (id) => api.get(`/shifts/${id}`).then((r) => r.data)
