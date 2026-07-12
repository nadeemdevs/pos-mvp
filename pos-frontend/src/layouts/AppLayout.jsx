import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useBranchStore } from '../store/branchStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings } from '../services/settingsService'
import { getBranches } from '../services/branchService'
import { toast } from '../store/toastStore'
import Toaster from '../components/Toaster'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', permission: null },
  { to: '/billing', label: 'Billing', permission: 'billing.create' },
  { to: '/tables', label: 'Tables', permissions: ['orders.take', 'tables.manage'], dineIn: true },
  { to: '/kitchen', label: 'Kitchen', permission: 'kitchen.view', dineIn: true },
  {
    to: '/reservations',
    label: 'Reservations',
    permissions: ['reservations.manage', 'orders.take'],
    feature: 'reservations',
  },
  { to: '/shifts', label: 'Shifts', permission: 'shifts.manage', feature: 'shifts' },
  { to: '/customers', label: 'Customers', permission: 'customers.manage' },
  { to: '/menu', label: 'Menu', permission: 'menu.manage' },
  { to: '/categories', label: 'Categories', permission: 'menu.manage' },
  { to: '/reports', label: 'Reports', permission: 'reports.view' },
  { to: '/analytics', label: 'Analytics', permission: 'analytics.view', feature: 'analytics' },
  {
    to: '/inventory',
    label: 'Inventory',
    permissions: ['inventory.manage', 'purchasing.manage'],
    feature: 'inventory',
  },
  { to: '/purchasing', label: 'Purchasing', permission: 'purchasing.manage', feature: 'inventory' },
  { to: '/audit', label: 'Audit', permission: 'audit.view' },
  { to: '/users', label: 'Users', permission: 'users.manage' },
  { to: '/roles', label: 'Roles', permission: 'roles.manage' },
  { to: '/settings', label: 'Settings', permission: 'settings.manage' },
]

export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()
  const activeBranch = useBranchStore((s) => s.activeBranch)
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  })

  // Multi-branch selector: stays hidden for single-branch operators. Only
  // fetched once a session exists; failures (e.g. endpoint not deployed yet,
  // or user lacks branches.manage) are swallowed rather than surfaced here.
  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => getBranches(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.items || []
  const activeBranches = branches.filter((b) => b.active !== false)
  const showBranchSelector = activeBranches.length > 1

  // If the persisted activeBranch code doesn't match any known active branch
  // (e.g. first time this endpoint is available, or the branch was
  // deactivated), fall back to the first active branch rather than showing a
  // <select> with no matching option.
  useEffect(() => {
    if (showBranchSelector && !activeBranches.some((b) => b.code === activeBranch)) {
      // Never silently move the user to an arbitrary branch — prefer the
      // main branch (case-insensitive), only then the first in the list.
      const main = activeBranches.find((b) => String(b.code).toLowerCase() === 'main')
      setActiveBranch(main ? main.code : activeBranches[0].code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBranchSelector, activeBranches.map((b) => b.code).join(',')])

  const dineInEnabled = !!settings?.features?.dineIn

  const visibleLinks = NAV_LINKS.filter((link) => {
    if (link.dineIn && !dineInEnabled) return false
    if (link.feature && !settings?.features?.[link.feature]) return false
    if (link.permissions) return link.permissions.some((p) => hasPermission(p))
    return !link.permission || hasPermission(link.permission)
  })

  const handleBranchChange = (code) => {
    if (code === activeBranch) return
    setActiveBranch(code)
    // invalidate (not clear): clear() empties the cache but does not refetch
    // queries that are currently mounted — the screen would keep showing the
    // previous branch's numbers until a manual reload.
    queryClient.invalidateQueries()
    const branch = activeBranches.find((b) => b.code === code)
    toast(`Switched to ${branch?.name || code}`, 'success')
  }

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
          {/* Platform-operator entry: only the platform admin ever sees this.
              Set apart from tenant navigation by a divider. */}
          {user?.platformAdmin && (
            <>
              <div className="sidebar-divider" />
              <NavLink
                to="/platform"
                className={({ isActive }) =>
                  'sidebar-link sidebar-link-platform' + (isActive ? ' active' : '')
                }
              >
                Platform
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="app-header-title">{settings?.restaurantName || 'Restaurant POS'}</div>
          <div className="app-header-user">
            {showBranchSelector && (
              <select
                className="branch-selector"
                value={activeBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
              >
                {activeBranches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
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
