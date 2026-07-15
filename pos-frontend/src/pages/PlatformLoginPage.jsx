import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { platformLogin } from '../services/platformService'
import { usePlatformAuthStore } from '../store/platformAuthStore'
import { toast } from '../store/toastStore'

// Phase 6.4a — public, top-level operator console login. Deliberately reuses
// the .login-card styling (not worth a bespoke visual language for this),
// but with a clearly different heading/tone so it never gets confused with
// the tenant staff login.
export default function PlatformLoginPage() {
  const token = usePlatformAuthStore((s) => s.token)
  const login = usePlatformAuthStore((s) => s.login)
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => platformLogin(email, password),
    onSuccess: (data) => {
      login(data.token, data.operator)
      navigate('/platform', { replace: true })
    },
    onError: (err) => {
      toast(err.response?.data?.message || 'Login failed', 'error')
    },
  })

  if (token) {
    return <Navigate to="/platform" replace />
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Platform Console</h1>
        <p className="login-subtitle">Operator sign-in — restricted access</p>
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
      </form>
    </div>
  )
}
