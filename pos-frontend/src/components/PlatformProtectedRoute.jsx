import { Navigate, Outlet } from 'react-router-dom'
import { usePlatformAuthStore } from '../store/platformAuthStore'

// Phase 6.4a — replaces the old ProtectedRoute's `requirePlatformAdmin` prop
// entirely. Checks ONLY platformAuthStore's token — never the tenant
// authStore, never any `user.platformAdmin` concept (that's retired). A
// tenant user's session (even Arabian Cafe's admin) has absolutely no
// bearing on this check.
export default function PlatformProtectedRoute() {
  const token = usePlatformAuthStore((s) => s.token)

  if (!token) {
    return <Navigate to="/platform/login" replace />
  }

  return <Outlet />
}
