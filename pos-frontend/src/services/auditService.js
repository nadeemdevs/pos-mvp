import api from './api'

export const getAuditLogs = (params = {}) =>
  api.get('/audit', { params }).then((r) => r.data)
