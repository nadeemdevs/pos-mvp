import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Modal from './Modal'
import { verifyApprovalPin } from '../services/approvalService'

// Shown when an invoice-creation attempt is rejected for exceeding the max
// discount. Manager enters the approval PIN; on success we get a short-lived
// approvalToken back which the caller attaches to the retried request.
export default function ApprovalPinModal({ open, onClose, onApproved }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPin('')
      setError('')
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () => verifyApprovalPin(pin),
    onSuccess: (data) => {
      onApproved?.(data?.approvalToken)
    },
    onError: (e) => {
      if (e.response?.status === 401) {
        setError('Wrong PIN')
      } else {
        setError(e.response?.data?.message || 'Failed to verify PIN')
      }
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!pin) return
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title="Manager Approval Required" width="360px">
      <p className="page-subtitle">This discount exceeds the allowed maximum. Enter the manager PIN to continue.</p>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span>Manager PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        {error && <p className="discount-hint-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!pin || mutation.isPending}>
            {mutation.isPending ? 'Verifying…' : 'Approve'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
