import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  CalendarCheck,
  ChefHat,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TrendingUp,
  UserCog,
  Users as UsersIcon,
  UtensilsCrossed,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBranchStore } from '../store/branchStore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings } from '../services/settingsService'
import { getBranches } from '../services/branchService'
import { resendVerification } from '../services/authService'
import { toast } from '../store/toastStore'
import Toaster from '../components/Toaster'

const VERIFY_BANNER_DISMISSED_KEY = 'emailVerifyBannerDismissed'

// Slim, dismissible-for-the-session nudge shown when the logged-in user's
// email hasn't been verified yet. Reuses the existing .banner/.banner-warning
// styles (see settings/order banners) for visual consistency.
function EmailVerificationBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(VERIFY_BANNER_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  const mutation = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => toast('Verification email sent', 'success'),
    onError: (e) => toast(e.response?.data?.message || 'Failed to resend verification email', 'error'),
  })

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(VERIFY_BANNER_DISMISSED_KEY, '1')
    } catch {
      // sessionStorage may be unavailable (private mode); non-fatal.
    }
  }

  if (dismissed) return null

  return (
    <div className="banner banner-warning">
      <span>Please verify your email address.</span>
      <span className="banner-actions">
        <button
          type="button"
          className="banner-link"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Sending…' : 'Resend'}
        </button>
        <button type="button" className="banner-link" onClick={handleDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  )
}

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', permission: null, icon: LayoutDashboard },
  { to: '/billing', label: 'Billing', permission: 'billing.create', icon: Receipt },
  {
    to: '/tables',
    label: 'Tables',
    permissions: ['orders.take', 'tables.manage'],
    dineIn: true,
    icon: LayoutGrid,
  },
  { to: '/kitchen', label: 'Kitchen', permission: 'kitchen.view', dineIn: true, icon: ChefHat },
  {
    to: '/reservations',
    label: 'Reservations',
    permissions: ['reservations.manage', 'orders.take'],
    feature: 'reservations',
    icon: CalendarCheck,
  },
  { to: '/shifts', label: 'Shifts', permission: 'shifts.manage', feature: 'shifts', icon: Clock },
  { to: '/customers', label: 'Customers', permission: 'customers.manage', icon: UsersIcon },
  { to: '/menu', label: 'Menu', permission: 'menu.manage', icon: UtensilsCrossed },
  { to: '/categories', label: 'Categories', permission: 'menu.manage', icon: Tags },
  { to: '/reports', label: 'Reports', permission: 'reports.view', icon: BarChart3 },
  {
    to: '/analytics',
    label: 'Analytics',
    permission: 'analytics.view',
    feature: 'analytics',
    icon: TrendingUp,
  },
  {
    to: '/inventory',
    label: 'Inventory',
    permissions: ['inventory.manage', 'purchasing.manage'],
    feature: 'inventory',
    icon: Package,
  },
  {
    to: '/purchasing',
    label: 'Purchasing',
    permission: 'purchasing.manage',
    feature: 'inventory',
    icon: ShoppingCart,
  },
  { to: '/audit', label: 'Audit', permission: 'audit.view', icon: ScrollText },
  { to: '/users', label: 'Users', permission: 'users.manage', icon: UserCog },
  { to: '/roles', label: 'Roles', permission: 'roles.manage', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', permission: 'settings.manage', icon: SettingsIcon },
]

const NAV_COLLAPSED_KEY = 'appNavCollapsed'

export default function AppLayout() {
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  )

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0')
    } catch {
      // localStorage may be unavailable (private mode); non-fatal.
    }
  }, [navCollapsed])

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

  // Phase 6.5 — branch locking. Mirrors the server-side rule in
  // common/middleware/tenantContext.js: a branches.manage holder, or any
  // staff member once the tenant opts in via
  // settings.branchAccess.staffCanSwitchBranches, may switch branches. Every
  // other staff member is locked to their own home branch.
  const canSwitchBranches = hasPermission('branches.manage') || !!settings?.branchAccess?.staffCanSwitchBranches
  const showBranchSelector = canSwitchBranches && activeBranches.length > 1

  // If the persisted activeBranch code doesn't match any known active branch
  // (e.g. first time this endpoint is available, or the branch was
  // deactivated), fall back to the first active branch rather than showing a
  // <select> with no matching option.
  useEffect(() => {
    if (
      showBranchSelector &&
      activeBranch !== 'all' &&
      !activeBranches.some((b) => b.code === activeBranch)
    ) {
      // Never silently move the user to an arbitrary branch — prefer the
      // main branch (case-insensitive), only then the first in the list.
      const main = activeBranches.find((b) => String(b.code).toLowerCase() === 'main')
      setActiveBranch(main ? main.code : activeBranches[0].code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBranchSelector, activeBranches.map((b) => b.code).join(',')])

  // Once we know the user is locked (no branches.manage AND the tenant
  // hasn't opted into staffCanSwitchBranches), force activeBranch to their
  // own home branch — this also catches the case where the browser has a
  // stale persisted activeBranch from an earlier session where the same
  // browser was used by someone with roaming permissions.
  useEffect(() => {
    if (!canSwitchBranches && user?.branchId && activeBranch !== user.branchId) {
      setActiveBranch(user.branchId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwitchBranches, user?.branchId])

  // Read-only branch name shown in place of the selector for locked users —
  // resolved from the user's own branchId against the already-fetched
  // branches list, falling back to the raw code if that list isn't loaded
  // yet (or the user lacks permission to view it).
  const ownBranchName =
    branches.find((b) => b.code === (user?.branchId || 'main'))?.name || user?.branchId || 'main'

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
    if (code === 'all') {
      toast('Switched to All Branches', 'success')
    } else {
      const branch = activeBranches.find((b) => b.code === code)
      toast(`Switched to ${branch?.name || code}`, 'success')
    }
  }

  return (
    <div className="app-shell">
      <aside className={'sidebar' + (navCollapsed ? ' sidebar-collapsed' : '')}>
        <div className="sidebar-brand" title={settings?.restaurantName || 'POS'}>
          {navCollapsed
            ? (settings?.restaurantName || 'POS').charAt(0).toUpperCase()
            : settings?.restaurantName || 'POS'}
        </div>
        <button
          type="button"
          className="sidebar-nav-toggle"
          onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {navCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!navCollapsed && <span>Collapse</span>}
        </button>
        <nav className="sidebar-nav">
          {visibleLinks.map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                title={link.label}
                className={({ isActive }) =>
                  'sidebar-link' + (isActive ? ' active' : '')
                }
              >
                {Icon && <Icon size={18} className="sidebar-link-icon" />}
                {!navCollapsed && <span className="sidebar-link-label">{link.label}</span>}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="app-header-title">{settings?.restaurantName || 'Restaurant POS'}</div>
          <div className="app-header-user">
            {showBranchSelector ? (
              <select
                className="branch-selector"
                value={activeBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
              >
                <option value="all">All Branches</option>
                {activeBranches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              activeBranches.length > 1 && (
                <span className="branch-readonly" title="You're locked to this branch — ask an admin to change it in Users">
                  {ownBranchName}
                </span>
              )
            )}
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Logout
            </button>
          </div>
        </header>
        <main className="app-content">
          {user?.emailVerified === false && <EmailVerificationBanner />}
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
