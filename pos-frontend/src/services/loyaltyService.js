import api from './api'

export const getLoyaltySummary = (customerId) =>
  api.get(`/loyalty/summary/${customerId}`).then((r) => r.data)

export const getLoyaltyTransactions = (customerId, params = {}) =>
  api.get(`/loyalty/transactions/${customerId}`, { params }).then((r) => r.data)

export const redeemLoyaltyPoints = (data) =>
  api.post('/loyalty/redeem', data).then((r) => r.data)

export const adjustLoyaltyPoints = (data) =>
  api.post('/loyalty/adjust', data).then((r) => r.data)
