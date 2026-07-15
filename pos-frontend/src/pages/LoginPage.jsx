import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
// Suspension notice is read synchronously on first render (and cleared) so a
// mid-session TENANT_SUSPENDED bounce shows the reason exactly once.
import { useMutation } from '@tanstack/react-query'
import { login as loginApi } from '../services/authService'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'

export default function LoginPage() {
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [suspendedNotice] = useState(() => {
    try {
      const msg = sessionStorage.getItem('suspendedNotice')
      if (msg) sessionStorage.removeItem('suspendedNotice')
      return msg
    } catch {
      return null
    }
  })

  const mutation = useMutation({
    mutationFn: () => loginApi(email, password),
    onSuccess: (data) => {
      setAuth(data)
      const dest = location.state?.from || '/'
      navigate(dest, { replace: true })
    },
    onError: (err) => {
      toast(err.response?.data?.message || 'Login failed', 'error')
    },
  })

  if (token) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Restaurant POS</h1>
        <p className="login-subtitle">Sign in to continue</p>
        {suspendedNotice && (
          <div className="login-banner login-banner-danger" role="alert">
            {suspendedNotice}
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="login-alt">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="login-alt">
          New here? <Link to="/signup">Create your restaurant</Link>
        </p>
      </form>
    </div>
  )
}
