import api from './api'

export const getBranches = (params = {}) =>
  api.get('/branches', { params }).then((r) => r.data)

export const createBranch = (data) => api.post('/branches', data).then((r) => r.data)

export const updateBranch = (id, data) =>
  api.put(`/branches/${id}`, data).then((r) => r.data)
