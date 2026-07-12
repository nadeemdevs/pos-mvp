import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { resetPassword } from '../services/authService'

// PUBLIC. Reads ?token= from the query string (the link emailed by
// forgot-password).
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState('')

  const mutation = useMutation({
    mutationFn: () => resetPassword({ token, newPassword }),
    onError: (err) => {
      setFormError(err.response?.data?.message || 'Could not reset your password')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')

    if (!token) {
      setFormError('This reset link is missing its token.')
      return
    }
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setFormError('Passwords do not match.')
      return
    }
    mutation.mutate()
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Reset your password</h1>
          <div className="form-error">This reset link is invalid — no token was found.</div>
          <p className="login-alt">
            <Link to="/forgot-password">Request a new link</Link>
          </p>
        </div>
      </div>
    )
  }

  if (mutation.isSuccess) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Password reset</h1>
          <div className="login-banner login-banner-success" role="status">
            Your password has been reset. You can now log in with your new password.
          </div>
          <p className="login-alt">
            <Link to="/login">Go to sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Reset your password</h1>
        <p className="login-subtitle">Choose a new password for your account.</p>

        {formError && <div className="form-error">{formError}</div>}

        <label className="field">
          <span>New Password</span>
          <input
            type="password"
            autoFocus
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <small className="field-hint">At least 8 characters.</small>
        </label>
        <label className="field">
          <span>Confirm Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Resetting…' : 'Reset password'}
        </button>
        <p className="login-alt">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  )
}
