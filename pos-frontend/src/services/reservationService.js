import api from './api'

export const getReservations = (params = {}) =>
  api.get('/reservations', { params }).then((r) => r.data)

export const createReservation = (data) =>
  api.post('/reservations', data).then((r) => r.data)

export const updateReservation = (id, data) =>
  api.put(`/reservations/${id}`, data).then((r) => r.data)

export const seatReservation = (id, data) =>
  api.post(`/reservations/${id}/seat`, data).then((r) => r.data)

export const cancelReservation = (id) =>
  api.post(`/reservations/${id}/cancel`).then((r) => r.data)

export const noShowReservation = (id) =>
  api.post(`/reservations/${id}/no-show`).then((r) => r.data)
