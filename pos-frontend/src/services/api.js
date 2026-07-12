import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useBranchStore } from '../store/branchStore'

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
  // Scope the request to the active branch. Harmless to send for
  // single-branch operators too — 'main' is the implicit default branch, so
  // the header is only omitted in that case to keep existing single-branch
  // deployments byte-for-byte unaffected.
  const activeBranch = useBranchStore.getState().activeBranch
  if (activeBranch && activeBranch !== 'main') {
    config.headers['x-branch-id'] = activeBranch
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code

    // Tenant was suspended by the platform operator — can land mid-session on
    // any authenticated request, not just at login. Log out and bounce to
    // /login, leaving a one-shot notice for the login page to surface. We
    // must NOT treat ordinary 403s (plain permission denials) this way — only
    // the explicit TENANT_SUSPENDED code.
    if (status === 403 && code === 'TENANT_SUSPENDED') {
      try {
        sessionStorage.setItem(
          'suspendedNotice',
          error.response?.data?.message ||
            'This restaurant has been suspended. Please contact support.',
        )
      } catch {
        // sessionStorage may be unavailable (private mode); non-fatal.
      }
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/qr')) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    if (status === 401) {
      useAuthStore.getState().logout()
      // The public QR-ordering surface is mounted outside the authenticated
      // app and must never be bounced to the staff login screen.
      if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/qr')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api
