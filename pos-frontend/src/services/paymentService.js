import api from './api'

export const takePayment = (data) =>
  api.post('/payments/manual', data).then((r) => r.data)
