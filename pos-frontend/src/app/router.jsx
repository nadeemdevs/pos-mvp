import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import RootRoute from '../components/RootRoute'
import DashboardRedirect from '../components/DashboardRedirect'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import SignupPage from '../pages/SignupPage'
import BillingPage from '../pages/BillingPage'
import TablesPage from '../pages/TablesPage'
import OrderPage from '../pages/OrderPage'
import KitchenPage from '../pages/KitchenPage'
import CustomersPage from '../pages/CustomersPage'
import MenuPage from '../pages/MenuPage'
import CategoriesPage from '../pages/CategoriesPage'
import ReportsPage from '../pages/ReportsPage'
import UsersPage from '../pages/UsersPage'
import RolesPage from '../pages/RolesPage'
import SettingsPage from '../pages/SettingsPage'
import InventoryPage from '../pages/InventoryPage'
import PurchasingPage from '../pages/PurchasingPage'
import AuditPage from '../pages/AuditPage'
import ReservationsPage from '../pages/ReservationsPage'
import ShiftsPage from '../pages/ShiftsPage'
import AnalyticsPage from '../pages/AnalyticsPage'
import PlatformPage from '../pages/PlatformPage'
import QrOrderPage from '../pages/qr/QrOrderPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
  },
  // Public landing / index route: logged-out visitors see the marketing
  // LandingPage; logged-in users fall through (via RootRoute's <Outlet/>) to
  // the protected AppLayout dashboard below.
  {
    path: '/',
    element: <RootRoute />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [{ index: true, element: <DashboardRedirect /> }],
          },
        ],
      },
    ],
  },
  // Public QR-ordering surface — deliberately OUTSIDE ProtectedRoute/AppLayout.
  // Guests scan a table QR code and land here with no auth, no sidebar, and
  // must never be redirected to /login (see api.js response interceptor).
  {
    path: '/qr/:qrToken',
    element: <QrOrderPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            element: <ProtectedRoute permission="billing.create" />,
            children: [{ path: '/billing', element: <BillingPage /> }],
          },
          {
            element: <ProtectedRoute anyPermission={['orders.take', 'tables.manage']} requireDineIn />,
            children: [{ path: '/tables', element: <TablesPage /> }],
          },
          {
            element: <ProtectedRoute permission="orders.take" requireDineIn />,
            children: [{ path: '/orders/:id', element: <OrderPage /> }],
          },
          {
            element: <ProtectedRoute permission="kitchen.view" requireDineIn />,
            children: [{ path: '/kitchen', element: <KitchenPage /> }],
          },
          {
            element: <ProtectedRoute permission="customers.manage" />,
            children: [{ path: '/customers', element: <CustomersPage /> }],
          },
          {
            element: <ProtectedRoute permission="menu.manage" />,
            children: [
              { path: '/menu', element: <MenuPage /> },
              { path: '/categories', element: <CategoriesPage /> },
            ],
          },
          {
            element: <ProtectedRoute permission="reports.view" />,
            children: [{ path: '/reports', element: <ReportsPage /> }],
          },
          {
            element: <ProtectedRoute permission="analytics.view" requireFeature="analytics" />,
            children: [{ path: '/analytics', element: <AnalyticsPage /> }],
          },
          {
            element: (
              <ProtectedRoute
                anyPermission={['inventory.manage', 'purchasing.manage']}
                requireFeature="inventory"
              />
            ),
            children: [{ path: '/inventory', element: <InventoryPage /> }],
          },
          {
            element: <ProtectedRoute permission="purchasing.manage" requireFeature="inventory" />,
            children: [{ path: '/purchasing', element: <PurchasingPage /> }],
          },
          {
            element: <ProtectedRoute permission="audit.view" />,
            children: [{ path: '/audit', element: <AuditPage /> }],
          },
          {
            element: (
              <ProtectedRoute
                anyPermission={['reservations.manage', 'orders.take']}
                requireFeature="reservations"
              />
            ),
            children: [{ path: '/reservations', element: <ReservationsPage /> }],
          },
          {
            element: <ProtectedRoute permission="shifts.manage" requireFeature="shifts" />,
            children: [{ path: '/shifts', element: <ShiftsPage /> }],
          },
          {
            element: <ProtectedRoute permission="users.manage" />,
            children: [{ path: '/users', element: <UsersPage /> }],
          },
          {
            element: <ProtectedRoute permission="roles.manage" />,
            children: [{ path: '/roles', element: <RolesPage /> }],
          },
          {
            element: <ProtectedRoute permission="settings.manage" />,
            children: [{ path: '/settings', element: <SettingsPage /> }],
          },
          {
            element: <ProtectedRoute requirePlatformAdmin />,
            children: [{ path: '/platform', element: <PlatformPage /> }],
          },
        ],
      },
    ],
  },
])
