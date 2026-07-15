import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'
import { getSettings } from '../services/settingsService'
import DashboardPage from '../pages/DashboardPage'

// The Dashboard route ('/') is empty for staff who only have dine-in
// permissions (Waiter, Kitchen) — send them straight to the screen they'll
// actually use instead of an empty reports-oriented dashboard.
export default function DashboardRedirect() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  })

  const dineInEnabled = !!settings?.features?.dineIn

  if (settings && !hasPermission('reports.view')) {
    if (dineInEnabled && hasPermission('orders.take')) {
      return <Navigate to="/tables" replace />
    }
    if (hasPermission('kitchen.view')) {
      return <Navigate to="/kitchen" replace />
    }
  }

  return <DashboardPage />
}
