import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Server,
  Settings as SettingsIcon,
} from 'lucide-react'
import { usePlatformAuthStore } from '../store/platformAuthStore'
import { searchPlatform } from '../services/platformService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Toaster from '../components/Toaster'

// Phase 6.4b — restyled Platform Console shell: LEFT sidebar (not the old
// top-nav) plus a dark theme scoped to `.platform-shell` in index.css.
// Deliberately still completely separate from AppLayout/the tenant sidebar —
// an operator must never mistake this for a tenant's own dashboard, and the
// dark theme override never leaks outside this ancestor class.
const NAV_ITEMS = [
  { to: '/platform', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/platform/tenants', label: 'Tenants', icon: Building2 },
  { to: '/platform/activity', label: 'Activity', icon: Activity },
  { to: '/platform/system', label: 'System', icon: Server },
  { to: '/platform/settings', label: 'Settings', icon: SettingsIcon },
]

const NAV_COLLAPSED_KEY = 'platformNavCollapsed'

function PlatformSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const debouncedQuery = useDebouncedValue(query, 300)

  const { data, isFetching } = useQuery({
    queryKey: ['platform', 'search', debouncedQuery],
    queryFn: () => searchPlatform(debouncedQuery),
    enabled: debouncedQuery.trim().length > 1,
    retry: false,
  })

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const tenants = data?.tenants || []
  const users = data?.users || []
  const hasResults = tenants.length > 0 || users.length > 0
  const showDropdown = open && debouncedQuery.trim().length > 1

  const goToTenant = (slug) => {
    setOpen(false)
    setQuery('')
    navigate(`/platform/tenants/${slug}`)
  }

  return (
    <div className="platform-search" ref={boxRef}>
      <input
        type="search"
        placeholder="Search tenants or users…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="platform-search-input"
      />
      {showDropdown && (
        <div className="platform-search-dropdown">
          {isFetching ? (
            <div className="platform-search-empty">Searching…</div>
          ) : !hasResults ? (
            <div className="platform-search-empty">No matches</div>
          ) : (
            <>
              {tenants.length > 0 && (
                <div className="platform-search-group">
                  <div className="platform-search-group-label">Tenants</div>
                  {tenants.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      className="platform-search-result"
                      onClick={() => goToTenant(t.slug)}
                    >
                      <span>{t.name}</span>
                      <span className="platform-search-result-sub">
                        {t.slug} · {t.ownerEmail || '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {users.length > 0 && (
                <div className="platform-search-group">
                  <div className="platform-search-group-label">Users</div>
                  {users.map((u) => (
                    <button
                      key={`${u.tenantSlug}:${u.email}`}
                      type="button"
                      className="platform-search-result"
                      onClick={() => goToTenant(u.tenantSlug)}
                    >
                      <span>{u.name}</span>
                      <span className="platform-search-result-sub">
                        {u.email} · {u.tenantName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlatformLayout() {
  const operator = usePlatformAuthStore((s) => s.operator)
  const logout = usePlatformAuthStore((s) => s.logout)

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

  return (
    <div className="platform-shell">
      <aside className={'platform-sidebar' + (navCollapsed ? ' platform-sidebar-collapsed' : '')}>
        <div className="platform-brand" title="Platform Console">
          {navCollapsed ? 'P' : 'Platform Console'}
        </div>
        <button
          type="button"
          className="platform-nav-toggle"
          onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {navCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!navCollapsed && <span>Collapse</span>}
        </button>
        <nav className="platform-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) => 'platform-nav-link' + (isActive ? ' active' : '')}
              >
                {Icon && <Icon size={18} className="platform-nav-link-icon" />}
                {!navCollapsed && <span className="platform-nav-link-label">{item.label}</span>}
              </NavLink>
            )
          })}
          {/* Tenant impersonation is explicitly out of scope for this phase —
              placeholder slot only, intentionally not a real nav link. */}
        </nav>
        <div className="platform-sidebar-footer">
          {navCollapsed ? (
            <button className="platform-logout-btn platform-logout-collapsed" onClick={logout} title="Logout">
              <LogOut size={16} />
            </button>
          ) : (
            <>
              <div className="platform-operator-info">
                <div className="platform-operator-name">{operator?.name}</div>
                <div className="platform-operator-email">{operator?.email}</div>
              </div>
              <button className="platform-logout-btn" onClick={logout} title="Logout">
                <LogOut size={16} />
              </button>
            </>
          )}
        </div>
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <PlatformSearch />
        </header>
        <main className="platform-content">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
