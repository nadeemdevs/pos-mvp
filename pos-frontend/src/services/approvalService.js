import api from './api'

export const verifyApprovalPin = (pin) =>
  api.post('/approvals/verify', { pin }).then((r) => r.data)

export const setApprovalPin = (pin) =>
  api.put('/settings/approvals/pin', { pin }).then((r) => r.data)
