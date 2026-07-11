import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { register as registerApi } from '../services/authService'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'

export default function SignupPage() {
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const [restaurantName, setRestaurantName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      registerApi({ restaurantName, ownerName, email, password }),
    onSuccess: (data) => {
      setAuth(data)
      navigate('/', { replace: true })
    },
    onError: (err) => {
      const msg =
        err.response?.data?.message || 'Could not create your restaurant'
      setFormError(msg)
      toast(msg, 'error')
    },
  })

  if (token) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    mutation.mutate()
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Create your restaurant</h1>
        <p className="login-subtitle">Set up your ServeOS account</p>

        {formError && <div className="form-error">{formError}</div>}

        <label className="field">
          <span>Restaurant Name</span>
          <input
            type="text"
            autoFocus
            required
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Your Name</span>
          <input
            type="text"
            required
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <small className="field-hint">At least 8 characters.</small>
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Creating…' : 'Create Restaurant'}
        </button>

        <p className="login-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
