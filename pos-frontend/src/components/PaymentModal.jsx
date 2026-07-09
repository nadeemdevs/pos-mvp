import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { formatCurrency } from '../utils/format'

const QUICK_CASH = [100, 200, 500]

export default function PaymentModal({ open, onClose, invoice, currency, onConfirm, isSubmitting }) {
  const [method, setMethod] = useState('CASH')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setTendered('')
      setReference('')
    }
  }, [open]);

  const total = invoice?.total || 0

  const change = useMemo(() => {
    const t = Number(tendered) || 0
    return Math.max(t - total, 0)
  }, [tendered, total])

  if (!invoice) return null

  const handleConfirm = () => {
    if (method === 'CASH') {
      onConfirm({
        invoiceId: invoice._id || invoice.id,
        method: 'CASH',
        amount: Number(tendered) || total,
      })
    } else {
      onConfirm({
        invoiceId: invoice._id || invoice.id,
        method: 'UPI',
        amount: total,
        reference,
      })
    }
  }

  const canConfirm =
    method === 'CASH'
      ? Number(tendered) >= total && Number(tendered) > 0
      : true

  return (
    <Modal open={open} onClose={onClose} title="Take Payment" width="420px">
      <div className="payment-total">
        <span>Amount Due</span>
        <span>{formatCurrency(total, currency)}</span>
      </div>

      <div className="method-toggle">
        <button
          type="button"
          className={`toggle-btn ${method === 'CASH' ? 'active' : ''}`}
          onClick={() => setMethod('CASH')}
        >
          Cash
        </button>
        <button
          type="button"
          className={`toggle-btn ${method === 'UPI' ? 'active' : ''}`}
          onClick={() => setMethod('UPI')}
        >
          UPI
        </button>
      </div>

      {method === 'CASH' ? (
        <div>
          <label className="field">
            <span>Tendered Amount</span>
            <input
              type="number"
              autoFocus
              step="0.01"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
            />
          </label>
          <div className="quick-cash-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setTendered(String(total))}
            >
              Exact
            </button>
            {QUICK_CASH.map((amt) => (
              <button
                key={amt}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setTendered(String(amt))}
              >
                {formatCurrency(amt, currency)}
              </button>
            ))}
          </div>
          <div className="change-row">
            <span>Change</span>
            <span>{formatCurrency(change, currency)}</span>
          </div>
        </div>
      ) : (
        <label className="field">
          <span>Reference / UTR (optional)</span>
          <input
            autoFocus
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canConfirm || isSubmitting}
          onClick={handleConfirm}
        >
          {isSubmitting ? 'Processing…' : 'Confirm Payment'}
        </button>
      </div>
    </Modal>
  )
}
