import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import Modal from './Modal'
import { formatCurrency } from '../utils/format'
import { settleInvoiceDelta } from '../services/invoiceService'
import { toast } from '../store/toastStore'

const METHODS = ['CASH', 'UPI', 'CARD']

// Settles the gap between a paid invoice's current total and what was
// actually collected, after an edit changed the total — records a Payment
// (type PAYMENT if the balance is owed, REFUND if cash needs to go back)
// without touching the invoice's paymentStatus (it's already PAID).
export default function SettleBalanceModal({ open, onClose, invoice, currency, direction, amount, onSettled }) {
  const [method, setMethod] = useState('CASH')
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setValue(amount ? Math.abs(amount).toFixed(2) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount])

  const mutation = useMutation({
    mutationFn: () =>
      settleInvoiceDelta(invoice._id || invoice.id, {
        amount: Number(value),
        method,
        direction,
      }),
    onSuccess: (payment) => {
      toast(direction === 'REFUND' ? 'Refund recorded' : 'Payment recorded', 'success')
      onSettled?.(payment)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to settle balance', 'error'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!Number(value) || Number(value) <= 0) return
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={direction === 'REFUND' ? 'Refund Balance' : 'Collect Balance'}
      width="380px"
    >
      <p className="page-subtitle">
        {direction === 'REFUND'
          ? `Hand back ${formatCurrency(Math.abs(amount || 0), currency)} to the customer.`
          : `Collect ${formatCurrency(Math.abs(amount || 0), currency)} more from the customer.`}
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field-row discount-toggle">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              className={`toggle-btn btn-sm ${method === m ? 'active' : ''}`}
              onClick={() => setMethod(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Amount</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
