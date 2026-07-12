import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { verifyEmail } from '../services/authService'

// PUBLIC. Auto-calls verifyEmail on mount with the ?token= from the emailed
// link, then shows a success/failure state.
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const mutation = useMutation({
    mutationFn: () => verifyEmail(token),
  })

  useEffect(() => {
    if (token) mutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  let body
  if (!token) {
    body = <div className="form-error">This verification link is invalid — no token was found.</div>
  } else if (mutation.isPending || mutation.isIdle) {
    body = <p className="login-subtitle">Verifying your email…</p>
  } else if (mutation.isSuccess) {
    body = (
      <div className="login-banner login-banner-success" role="status">
        Your email address has been verified.
      </div>
    )
  } else {
    body = (
      <div className="form-error">
        {mutation.error?.response?.data?.message || 'Could not verify your email.'}
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Verify your email</h1>
        {body}
        <p className="login-alt">
          <Link to="/">Go to home</Link>
        </p>
      </div>
    </div>
  )
}
