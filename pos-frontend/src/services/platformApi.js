import axios from 'axios'
import { usePlatformAuthStore } from '../store/platformAuthStore'

// Dedicated axios instance for the /api/platform/* surface — mirrors
// publicApi.js's separate-instance pattern. Deliberately independent of
// services/api.js: attaches the PLATFORM operator's token (from
// platformAuthStore), never the tenant authStore's token, and on a 401
// clears ONLY the platform session and bounces to /platform/login. A tenant
// session (if any, in the same browser) is completely untouched by any of
// this.
const platformApi = axios.create({
  baseURL: '/api/platform',
})

platformApi.interceptors.request.use((config) => {
  const token = usePlatformAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    // Don't bounce the operator's own login attempt on a bad-credentials 401.
    const isLoginRequest = error.config?.url?.includes('/auth/login')

    if (status === 401 && !isLoginRequest) {
      usePlatformAuthStore.getState().logout()
      if (window.location.pathname !== '/platform/login') {
        window.location.href = '/platform/login'
      }
    }
    return Promise.reject(error)
  },
)

export default platformApi
