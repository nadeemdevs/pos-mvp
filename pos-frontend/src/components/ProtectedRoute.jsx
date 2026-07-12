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
// the URL is reached. `requireFeature` is the generic Phase 5 equivalent —
// pass a settings.features key (e.g. "inventory") to hide the route unless
// that flag is on. `requirePlatformAdmin` restricts the route to the platform
// operator (user.platformAdmin) — used for the /platform surface.
export default function ProtectedRoute({
  permission,
  anyPermission,
  requireDineIn,
  requireFeature,
  requirePlatformAdmin,
}) {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const needsSettings = !!requireDineIn || !!requireFeature
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
    enabled: !!token && needsSettings,
  })

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (requirePlatformAdmin && !user?.platformAdmin) {
    return <Navigate to="/" replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  if (anyPermission && !anyPermission.some((p) => hasPermission(p))) {
    return <Navigate to="/" replace />
  }

  // Once settings have loaded, redirect away if the required feature flag is
  // off. While loading we let the route render rather than block on every
  // navigation.
  if (requireDineIn && settings && !settings.features?.dineIn) {
    return <Navigate to="/" replace />
  }

  if (requireFeature && settings && !settings.features?.[requireFeature]) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
