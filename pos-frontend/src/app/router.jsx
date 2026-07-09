import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/ProtectedRoute'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import BillingPage from '../pages/BillingPage'
import MenuPage from '../pages/MenuPage'
import CategoriesPage from '../pages/CategoriesPage'
import ReportsPage from '../pages/ReportsPage'
import UsersPage from '../pages/UsersPage'
import RolesPage from '../pages/RolesPage'
import SettingsPage from '../pages/SettingsPage'

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
          { path: '/', element: <DashboardPage /> },
          {
            element: <ProtectedRoute permission="billing.create" />,
            children: [{ path: '/billing', element: <BillingPage /> }],
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
