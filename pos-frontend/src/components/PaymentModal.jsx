import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import Modal from './Modal'
import { formatCurrency } from '../utils/format'
import { cancelCardPayment, getPayment, initiateCardPayment } from '../services/paymentService'
import { getLoyaltySummary, redeemLoyaltyPoints } from '../services/loyaltyService'
import { toast } from '../store/toastStore'

const QUICK_CASH = [100, 200, 500]

const PROVIDER_LABELS = {
  MOCK: 'Mock Terminal (Dev)',
  PINELABS: 'Pine Labs',
  WORLDLINE: 'Worldline',
}

const POLLING_STATUSES = ['INITIATED', 'PROCESSING']

const STATUS_TEXT = {
  INITIATED: 'Sending to terminal…',
  PROCESSING: 'Waiting for customer card…',
}

const FAILURE_TEXT = {
  FAILED: 'Payment failed',
  CANCELLED: 'Payment cancelled',
  TIMEOUT: 'Payment timed out',
}

export default function PaymentModal({
  open,
  onClose,
  invoice,
  currency,
  settings,
  onConfirm,
  onCardSuccess,
  onInvoiceUpdate,
  isSubmitting,
}) {
  const [method, setMethod] = useState('CASH')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')

  const enabledProviders = settings?.paymentProviders?.enabled || []
  const cardEnabled = enabledProviders.length > 0

  const [provider, setProvider] = useState('')
  const [cardStage, setCardStage] = useState('select') // 'select' | 'waiting' | 'error'
  const [cardPayment, setCardPayment] = useState(null)
  const [cardError, setCardError] = useState('')

  const [redeemPoints, setRedeemPoints] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('CASH')
      setTendered(String(invoice?.total || 0))
      setReference('')
      setCardStage('select')
      setCardPayment(null)
      setCardError('')
      setProvider(enabledProviders[0] || '')
      setRedeemPoints('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const customerId = invoice?.customer?._id || invoice?.customer?.id || invoice?.customerId
  const loyaltyEnabled = !!settings?.features?.loyalty && !!customerId

  const { data: loyaltySummary } = useQuery({
    queryKey: ['loyalty', 'summary', customerId],
    queryFn: () => getLoyaltySummary(customerId),
    enabled: open && loyaltyEnabled,
  })

  const alreadyRedeemed = !!invoice?.loyaltyPoints
  const pointValue = loyaltySummary?.pointValue || 1
  const total = invoice?.total || 0
  const maxRedeemable = Math.min(
    loyaltySummary?.points || 0,
    Math.floor(total / pointValue) || 0,
  )
  const redeemPreview = (Number(redeemPoints) || 0) * pointValue

  const redeemMutation = useMutation({
    mutationFn: () =>
      redeemLoyaltyPoints({ invoiceId: invoice._id || invoice.id, points: Number(redeemPoints) }),
    onSuccess: (updatedInvoice) => {
      onInvoiceUpdate?.(updatedInvoice)
      toast('Loyalty points applied', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to redeem points', 'error'),
  })

  const change = useMemo(() => {
    const t = Number(tendered) || 0
    return Math.max(t - total, 0)
  }, [tendered, total])

  const isPolling = !!cardPayment && POLLING_STATUSES.includes(cardPayment.status)

  // Single funnel for both the initiate response and every poll response so
  // SUCCESS/FAILED/CANCELLED/TIMEOUT are handled identically no matter which
  // call surfaced the terminal status (covers the idempotent "already
  // succeeded" case returned straight from initiate too).
  const applyPaymentUpdate = (payment) => {
    if (!payment) return
    setCardPayment(payment)
    if (!payment.status || POLLING_STATUSES.includes(payment.status)) {
      setCardError('')
      setCardStage('waiting')
    } else if (payment.status === 'SUCCESS') {
      setCardStage('waiting')
      onCardSuccess?.(payment)
    } else {
      setCardError(payment.failureReason || FAILURE_TEXT[payment.status] || 'Payment failed')
      setCardStage('error')
    }
  }

  const initiateMutation = useMutation({
    mutationFn: (prov) => initiateCardPayment(invoice._id || invoice.id, prov),
    onSuccess: applyPaymentUpdate,
    onError: (e) => {
      setCardError(e.response?.data?.message || 'Failed to reach the card terminal')
      setCardStage('error')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelCardPayment(id),
    onSettled: () => {
      setCardPayment(null)
      setCardStage('select')
    },
  })

  const { data: polledPayment } = useQuery({
    queryKey: ['card-payment', cardPayment?._id],
    queryFn: () => getPayment(cardPayment._id),
    enabled: open && !!cardPayment?._id && isPolling,
    refetchInterval: open && isPolling ? 2000 : false,
  })

  useEffect(() => {
    if (polledPayment) applyPaymentUpdate(polledPayment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledPayment])

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

  const handleSendToTerminal = () => {
    if (!provider || initiateMutation.isPending) return
    setCardError('')
    initiateMutation.mutate(provider)
  }

  const handleCancelTerminal = () => {
    if (cardPayment?._id) {
      cancelMutation.mutate(cardPayment._id)
    } else {
      setCardStage('select')
    }
  }

  const handleTryAgain = () => {
    setCardError('')
    setCardPayment(null)
    setCardStage('select')
  }

  const handleClose = () => {
    if (isPolling && cardPayment?._id) {
      // Best-effort cancel of the in-flight terminal transaction so it
      // doesn't linger server-side once the modal is dismissed.
      cancelCardPayment(cardPayment._id).catch(() => {})
    }
    onClose()
  }

  const canConfirm =
    method === 'CASH'
      ? Number(tendered) >= total && Number(tendered) > 0
      : true

  const renderCardWaiting = () => (
    <div className="card-waiting">
      <div className="card-waiting-amount">{formatCurrency(total, currency)}</div>
      <div className="card-waiting-provider">{PROVIDER_LABELS[provider] || provider}</div>
      <div className="card-waiting-indicator">
        <span className="card-pulse-dot" />
        <span className="card-pulse-dot" />
        <span className="card-pulse-dot" />
      </div>
      <div className="card-waiting-status">
        Waiting for card…
        <br />
        <span className={`status-pill status-pill-${(cardPayment?.status || 'INITIATED').toLowerCase()}`}>
          {STATUS_TEXT[cardPayment?.status] || cardPayment?.status || 'Sending to terminal…'}
        </span>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={cancelMutation.isPending}
          onClick={handleCancelTerminal}
        >
          {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    </div>
  )

  const renderCardError = () => (
    <div className="card-error">
      <div className={`status-pill status-pill-${(cardPayment?.status || 'failed').toLowerCase()}`}>
        {FAILURE_TEXT[cardPayment?.status] || 'Payment failed'}
      </div>
      <p className="card-error-reason">{cardError}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={handleTryAgain}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSendToTerminal}>
          Try Again
        </button>
      </div>
    </div>
  )

  const renderCardSelect = () => (
    <div>
      {enabledProviders.length > 1 && (
        <label className="field">
          <span>Terminal / Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {enabledProviders.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p] || p}
              </option>
            ))}
          </select>
        </label>
      )}
      {enabledProviders.length === 1 && (
        <p className="card-single-provider">
          Terminal: <strong>{PROVIDER_LABELS[provider] || provider}</strong>
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={handleClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!provider || initiateMutation.isPending}
          onClick={handleSendToTerminal}
        >
          {initiateMutation.isPending ? 'Sending…' : 'Send to Terminal'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={handleClose} title="Take Payment" width="420px">
      {loyaltyEnabled && (
        <div className="loyalty-block">
          <div className="loyalty-block-header">
            <span>Loyalty</span>
            {loyaltySummary?.tier && <span className="tier-badge">{loyaltySummary.tier}</span>}
          </div>
          <div className="loyalty-block-balance">
            {loyaltySummary?.points ?? 0} pts available
          </div>
          {alreadyRedeemed ? (
            <div className="loyalty-applied">
              −{formatCurrency(invoice.loyaltyDiscount, currency)} ({invoice.loyaltyPoints} pts)
            </div>
          ) : (
            <div className="loyalty-redeem-row">
              <input
                type="number"
                min="0"
                max={maxRedeemable}
                placeholder="Points to redeem"
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
              />
              <span className="loyalty-preview">
                {redeemPreview > 0 ? `→ −${formatCurrency(redeemPreview, currency)}` : ''}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={
                  !redeemPoints ||
                  Number(redeemPoints) <= 0 ||
                  Number(redeemPoints) > maxRedeemable ||
                  redeemMutation.isPending
                }
                onClick={() => redeemMutation.mutate()}
              >
                {redeemMutation.isPending ? 'Applying…' : 'Apply'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="payment-total">
        <span>Amount Due</span>
        <span>{formatCurrency(total, currency)}</span>
      </div>

      <div className="method-toggle">
        <button
          type="button"
          className={`toggle-btn ${method === 'CASH' ? 'active' : ''}`}
          disabled={isPolling}
          onClick={() => setMethod('CASH')}
        >
          Cash
        </button>
        <button
          type="button"
          className={`toggle-btn ${method === 'UPI' ? 'active' : ''}`}
          disabled={isPolling}
          onClick={() => setMethod('UPI')}
        >
          UPI
        </button>
        {cardEnabled && (
          <button
            type="button"
            className={`toggle-btn ${method === 'CARD' ? 'active' : ''}`}
            disabled={isPolling}
            onClick={() => setMethod('CARD')}
          >
            Card
          </button>
        )}
      </div>

      {method === 'CASH' && (
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
              Exact ({total.toFixed(2)})
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
      )}

      {method === 'UPI' && (
        <label className="field">
          <span>Reference / UTR (optional)</span>
          <input
            autoFocus
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      )}

      {method === 'CARD' && (
        <>
          {cardStage === 'select' && renderCardSelect()}
          {cardStage === 'waiting' && renderCardWaiting()}
          {cardStage === 'error' && renderCardError()}
        </>
      )}

      {method !== 'CARD' && (
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
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
      )}
    </Modal>
  )
}
