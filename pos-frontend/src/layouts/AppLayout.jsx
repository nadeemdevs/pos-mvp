import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useQuery } from '@tanstack/react-query'
import { getSettings } from '../services/settingsService'
import Toaster from '../components/Toaster'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', permission: null },
  { to: '/billing', label: 'Billing', permission: 'billing.create' },
  { to: '/tables', label: 'Tables', permissions: ['orders.take', 'tables.manage'], dineIn: true },
  { to: '/kitchen', label: 'Kitchen', permission: 'kitchen.view', dineIn: true },
  { to: '/customers', label: 'Customers', permission: 'customers.manage' },
  { to: '/menu', label: 'Menu', permission: 'menu.manage' },
  { to: '/categories', label: 'Categories', permission: 'menu.manage' },
  { to: '/reports', label: 'Reports', permission: 'reports.view' },
  { to: '/users', label: 'Users', permission: 'users.manage' },
  { to: '/roles', label: 'Roles', permission: 'roles.manage' },
  { to: '/settings', label: 'Settings', permission: 'settings.manage' },
]

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const logout = useAuthStore((s) => s.logout)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  })

  const dineInEnabled = !!settings?.features?.dineIn

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (link.dineIn && !dineInEnabled) return false
    if (link.permissions) return link.permissions.some((p) => hasPermission(p))
    return !link.permission || hasPermission(link.permission)
  })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {settings?.restaurantName || 'POS'}
        </div>
        <nav className="sidebar-nav">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                'sidebar-link' + (isActive ? ' active' : '')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="app-header-title">{settings?.restaurantName || 'Restaurant POS'}</div>
          <div className="app-header-user">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Logout
            </button>
          </div>
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
