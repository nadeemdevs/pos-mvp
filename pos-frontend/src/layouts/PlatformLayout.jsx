import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  { to: '/platform', label: 'Overview', end: true },
  { to: '/platform/tenants', label: 'Tenants' },
  { to: '/platform/activity', label: 'Activity' },
  { to: '/platform/system', label: 'System' },
  { to: '/platform/settings', label: 'Settings' },
]

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

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="platform-brand">Platform Console</div>
        <nav className="platform-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'platform-nav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
          {/* Tenant impersonation is explicitly out of scope for this phase —
              placeholder slot only, intentionally not a real nav link. */}
        </nav>
        <div className="platform-sidebar-footer">
          <div className="platform-operator-name">{operator?.name}</div>
          <div className="platform-operator-email">{operator?.email}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Logout
          </button>
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
