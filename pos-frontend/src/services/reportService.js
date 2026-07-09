import api from './api'

export const getDailyReport = (date) =>
  api.get('/reports/daily', { params: { date } }).then((r) => r.data)

export const getItemsReport = (from, to) =>
  api.get('/reports/items', { params: { from, to } }).then((r) => r.data)

export const getPaymentsReport = (date) =>
  api.get('/reports/payments', { params: { date } }).then((r) => r.data)
