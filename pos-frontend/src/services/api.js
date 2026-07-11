import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
})

// One-shot approval token: set by the approval-PIN flow right before it
// retries a request that was rejected for exceeding the max discount. The
// request interceptor attaches it to the very next outgoing request only,
// then clears it — callers never need to remember to strip it back off.
let pendingApprovalToken = null

export function setApprovalToken(token) {
  pendingApprovalToken = token
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (pendingApprovalToken) {
    config.headers['x-approval-token'] = pendingApprovalToken
    pendingApprovalToken = null
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api
