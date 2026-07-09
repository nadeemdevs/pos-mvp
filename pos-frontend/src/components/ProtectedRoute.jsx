import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function ProtectedRoute({ permission }) {
  const token = useAuthStore((s) => s.token)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
