import api from './api'

export const createInvoice = (data) =>
  api.post('/invoice', data).then((r) => r.data)

export const getInvoices = (params = {}) =>
  api.get('/invoice', { params }).then((r) => r.data)

export const getInvoice = (id) =>
  api.get(`/invoice/${id}`).then((r) => r.data)

export const updateInvoice = (id, data) =>
  api.put(`/invoice/${id}`, data).then((r) => r.data)

export const refundInvoice = (id, data) =>
  api.post(`/invoice/${id}/refund`, data).then((r) => r.data)

export const settleInvoiceDelta = (id, data) =>
  api.post(`/invoice/${id}/settle`, data).then((r) => r.data)
