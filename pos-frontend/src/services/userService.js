import api from './api'

export const getUsers = () => api.get('/users').then((r) => r.data)

export const createUser = (data) => api.post('/users', data).then((r) => r.data)

export const updateUser = (id, data) =>
  api.put(`/users/${id}`, data).then((r) => r.data)

export const deleteUser = (id) => api.delete(`/users/${id}`).then((r) => r.data)
