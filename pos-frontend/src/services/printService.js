import api from './api'

export const testPrint = (target) => api.post('/print/test', { target }).then((r) => r.data)
