import api from './api'

// Platform-operator surface. All endpoints require user.platformAdmin on the
// backend (403 otherwise); the UI additionally gates the route/nav so these
// are only ever called by the platform operator.

export const getPlatformOverview = () =>
  api.get('/platform/overview').then((r) => r.data)

export const getPlatformTenants = () =>
  api.get('/platform/tenants').then((r) => r.data)

export const setTenantStatus = (slug, status) =>
  api.patch(`/platform/tenants/${slug}`, { status }).then((r) => r.data)
