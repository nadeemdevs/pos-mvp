import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import DashboardRedirect from '../components/DashboardRedirect'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
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

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardRedirect /> },
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
        ],
      },
    ],
  },
])
