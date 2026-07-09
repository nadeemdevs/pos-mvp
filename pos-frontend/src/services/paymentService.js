import api from './api'

export const takePayment = (data) =>
  api.post('/payments/manual', data).then((r) => r.data)

// Card-terminal payments (Phase 2). Backend responses may come back as
// either { payment } or the bare payment object — unwrap defensively.
const unwrapPayment = (data) => data?.payment || data

export const initiateCardPayment = (invoiceId, provider) =>
  api
    .post('/payments/initiate', { invoiceId, provider })
    .then((r) => unwrapPayment(r.data))

export const getPayment = (id) =>
  api.get(`/payments/${id}`).then((r) => unwrapPayment(r.data))

export const cancelCardPayment = (id) =>
  api.post(`/payments/${id}/cancel`).then((r) => unwrapPayment(r.data))
