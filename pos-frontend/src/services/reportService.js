import api from './api'

export const getDailyReport = (date) =>
  api.get('/reports/daily', { params: { date } }).then((r) => r.data)

export const getItemsReport = (from, to) =>
  api.get('/reports/items', { params: { from, to } }).then((r) => r.data)

export const getPaymentsReport = (date) =>
  api.get('/reports/payments', { params: { date } }).then((r) => r.data)

export const getDiscountsReport = (from, to) =>
  api.get('/reports/discounts', { params: { from, to } }).then((r) => r.data)

export const getCancelledReport = (from, to) =>
  api.get('/reports/cancelled', { params: { from, to } }).then((r) => r.data)

export const getTaxReport = (from, to) =>
  api.get('/reports/tax', { params: { from, to } }).then((r) => r.data)
