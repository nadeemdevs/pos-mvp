import { Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import LandingPage from '../pages/LandingPage'

// The index route ('/') is public: logged-OUT visitors see the marketing
// LandingPage (no sidebar, outside AppLayout). Logged-IN users fall through to
// the nested ProtectedRoute > AppLayout > DashboardRedirect via <Outlet/>,
// preserving the existing dashboard behavior. Because this route only matches
// '/', other paths (e.g. /billing) are unaffected and still redirect to
// /login when unauthenticated.
export default function RootRoute() {
  const token = useAuthStore((s) => s.token)
  if (!token) {
    return <LandingPage />
  }
  return <Outlet />
}
