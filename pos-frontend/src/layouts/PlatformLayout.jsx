import { NavLink, Outlet } from 'react-router-dom'
import { usePlatformAuthStore } from '../store/platformAuthStore'
import Toaster from '../components/Toaster'

// Phase 6.4a — completely separate from AppLayout. Platform operators are
// not tenant users and must never see the tenant sidebar/nav (billing,
// tables, menu, etc.) — this is a minimal top-nav console shell instead.
export default function PlatformLayout() {
  const operator = usePlatformAuthStore((s) => s.operator)
  const logout = usePlatformAuthStore((s) => s.logout)

  return (
    <div className="platform-shell">
      <header className="platform-header">
        <div className="platform-brand">Platform Console</div>
        <nav className="platform-nav">
          <NavLink
            to="/platform"
            end
            className={({ isActive }) => 'platform-nav-link' + (isActive ? ' active' : '')}
          >
            Overview
          </NavLink>
          <NavLink
            to="/platform/settings"
            className={({ isActive }) => 'platform-nav-link' + (isActive ? ' active' : '')}
          >
            Settings
          </NavLink>
        </nav>
        <div className="platform-header-user">
          <span className="user-name">{operator?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <main className="platform-content">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}
