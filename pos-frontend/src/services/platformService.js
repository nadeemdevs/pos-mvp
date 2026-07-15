import platformApi from './platformApi'

// Platform-operator surface. Every call here goes through the dedicated
// platformApi axios instance (separate token/session from the tenant app —
// see services/platformApi.js). The backend gates all of it with
// requirePlatformAuth against a wholly separate PlatformOperator identity,
// not a tenant user's `platformAdmin` flag (that mechanism is retired).

export const platformLogin = (email, password) =>
  platformApi.post('/auth/login', { email, password }).then((r) => r.data)

export const getPlatformMe = () => platformApi.get('/auth/me').then((r) => r.data)

export const getPlatformOverview = (range) =>
  platformApi.get('/overview', { params: range ? { range } : undefined }).then((r) => r.data)

export const getPlatformTenants = (range, sort) =>
  platformApi
    .get('/tenants', { params: { ...(range ? { range } : {}), ...(sort ? { sort } : {}) } })
    .then((r) => r.data)

export const setTenantStatus = (slug, status) =>
  platformApi.patch(`/tenants/${slug}`, { status }).then((r) => r.data)

export const getPlatformSettings = () => platformApi.get('/settings').then((r) => r.data)

export const updatePlatformSettings = (payload) => platformApi.put('/settings', payload).then((r) => r.data)

export const getPlatformTenantDetail = (slug, range) =>
  platformApi.get(`/tenants/${slug}`, { params: range ? { range } : undefined }).then((r) => r.data)

export const updateTenantFeatures = (slug, features) =>
  platformApi.put(`/tenants/${slug}/features`, { features }).then((r) => r.data)

export const getPlatformAuditLogs = (params) => platformApi.get('/audit', { params }).then((r) => r.data)

export const getPlatformHealth = () => platformApi.get('/health').then((r) => r.data)

export const searchPlatform = (q) => platformApi.get('/search', { params: { q } }).then((r) => r.data)
