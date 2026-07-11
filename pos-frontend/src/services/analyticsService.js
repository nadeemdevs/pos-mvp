import api from './api'

export const getAnalyticsOverview = (from, to) =>
  api.get('/analytics/overview', { params: { from, to } }).then((r) => r.data)

export const getPeakHours = (from, to) =>
  api.get('/analytics/peak-hours', { params: { from, to } }).then((r) => r.data)

export const getItemProfitability = (from, to) =>
  api.get('/analytics/items', { params: { from, to } }).then((r) => r.data)

export const getChannelBreakdown = (from, to) =>
  api.get('/analytics/channels', { params: { from, to } }).then((r) => r.data)

export const getInventoryValue = (from, to) =>
  api.get('/analytics/inventory-value', { params: { from, to } }).then((r) => r.data)

export const getBranchBreakdown = (from, to) =>
  api.get('/analytics/branches', { params: { from, to } }).then((r) => r.data)
