import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
