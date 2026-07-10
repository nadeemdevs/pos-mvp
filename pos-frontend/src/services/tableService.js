import api from './api'

export const getTables = () => api.get('/tables').then((r) => r.data)

export const createTable = (data) => api.post('/tables', data).then((r) => r.data)

export const updateTable = (id, data) =>
  api.put(`/tables/${id}`, data).then((r) => r.data)

export const deleteTable = (id) => api.delete(`/tables/${id}`).then((r) => r.data)

export const transferTable = (id, toTableId) =>
  api.post(`/tables/${id}/transfer`, { toTableId }).then((r) => r.data)

export const mergeTable = (id, fromTableId) =>
  api.post(`/tables/${id}/merge`, { fromTableId }).then((r) => r.data)
