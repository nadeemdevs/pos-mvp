import api from './api'

export const getSettings = () => api.get('/settings').then((r) => r.data)

export const updateSettings = (data) =>
  api.put('/settings', data).then((r) => r.data)
