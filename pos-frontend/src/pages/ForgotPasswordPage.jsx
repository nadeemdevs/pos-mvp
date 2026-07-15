import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { forgotPassword } from '../services/authService'

// PUBLIC. The backend always returns the same generic message/status
// regardless of whether the email exists — no enumeration side-channel — so
// this page just shows that response as-is on success.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: () => forgotPassword(email),
    onSuccess: () => setSubmitted(true),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Forgot your password?</h1>
        <p className="login-subtitle">
          Enter the email on your account and we'll send you a reset link.
        </p>

        {submitted ? (
          <>
            <div className="login-banner login-banner-success" role="status">
              If an account exists for that email, we've sent a reset link.
            </div>
            <p className="login-alt">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
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
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="login-alt">
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
