import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { getSettings } from '../services/settingsService'

// `permission` requires a single permission. `anyPermission` (array) passes
// if the user holds ANY of the listed permissions (used for Tables, which is
// reachable by either a waiter with orders.take or an admin with
// tables.manage). `requireDineIn` additionally hides the route entirely
// unless settings.features.dineIn is on — used for all Phase 4 routes so
// they stay invisible until the feature is switched on, regardless of how
// the URL is reached.
export default function ProtectedRoute({ permission, anyPermission, requireDineIn }) {
  const token = useAuthStore((s) => s.token)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
    enabled: !!token && !!requireDineIn,
  })

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  if (anyPermission && !anyPermission.some((p) => hasPermission(p))) {
    return <Navigate to="/" replace />
  }

  // Once settings have loaded, redirect away if dine-in is disabled. While
  // loading we let the route render rather than block on every navigation.
  if (requireDineIn && settings && !settings.features?.dineIn) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
