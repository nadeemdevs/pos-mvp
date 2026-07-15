import api from './api'

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const getMe = () => api.get('/auth/me').then((r) => r.data)

export const register = (payload) =>
  api.post('/auth/register', payload).then((r) => r.data)

export const forgotPassword = (email) =>
  api.post('/auth/forgot-password', { email }).then((r) => r.data)

export const resetPassword = ({ token, newPassword }) =>
  api.post('/auth/reset-password', { token, newPassword }).then((r) => r.data)

export const verifyEmail = (token) =>
  api.post('/auth/verify-email', { token }).then((r) => r.data)

export const resendVerification = () =>
  api.post('/auth/resend-verification').then((r) => r.data)

export const changePassword = ({ currentPassword, newPassword }) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data)

export const changeEmail = ({ newEmail, currentPassword }) =>
  api.post('/auth/change-email', { newEmail, currentPassword }).then((r) => r.data)
