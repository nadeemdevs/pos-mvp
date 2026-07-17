import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import ApprovalPinModal from './ApprovalPinModal'
import SettleBalanceModal from './SettleBalanceModal'
import Spinner from './Spinner'
import { getInvoice, updateInvoice, refundInvoice } from '../services/invoiceService'
import { getPaymentsForInvoice } from '../services/paymentService'
import { setApprovalToken } from '../services/api'
import { useCartStore, selectActiveCart } from '../store/cartStore'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDateTime } from '../utils/format'

const STATUS_BADGE = {
  PENDING: 'badge-warning',
  PAID: 'badge-success',
  REFUNDED: 'badge-danger',
}

function needsApproval(e) {
  const status = e.response?.status
  const message = e.response?.data?.message || ''
  return status === 403 || (status === 400 && /discount exceeds/i.test(message))
}

export default function InvoiceDetailModal({ invoiceId, open, onClose, currency }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const cart = useCartStore()

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalAction, setApprovalAction] = useState(null) // 'refund'

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: open && !!invoiceId,
  })

  const { data: paymentsData } = useQuery({
    queryKey: ['payments', 'invoice', invoiceId],
    queryFn: () => getPaymentsForInvoice(invoiceId),
    enabled: open && !!invoiceId,
  })
  const payments = paymentsData?.items || []

  const netPaid = useMemo(
    () => payments.reduce((sum, p) => sum + (p.type === 'REFUND' ? -p.amount : p.amount), 0),
    [payments],
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['payments', 'invoice', invoiceId] })
  }

  const cancelMutation = useMutation({
    mutationFn: () => updateInvoice(invoiceId, { status: 'CANCELLED' }),
    onSuccess: () => {
      toast('Invoice cancelled', 'success')
      setCancelConfirmOpen(false)
      invalidate()
      onClose?.()
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to cancel invoice', 'error')
      setCancelConfirmOpen(false)
    },
  })

  const refundMutation = useMutation({
    mutationFn: () => refundInvoice(invoiceId, {}),
    onSuccess: () => {
      toast('Invoice refunded', 'success')
      setRefundConfirmOpen(false)
      invalidate()
      onClose?.()
    },
    onError: (e) => {
      setRefundConfirmOpen(false)
      if (needsApproval(e)) {
        setApprovalAction('refund')
        setApprovalOpen(true)
        return
      }
      toast(e.response?.data?.message || 'Failed to refund invoice', 'error')
    },
  })

  const handleApprovalApproved = (token) => {
    setApprovalToken(token)
    setApprovalOpen(false)
    if (approvalAction === 'refund') {
      refundMutation.mutate()
    }
  }

  const handleEdit = () => {
    // Don't clobber an order in progress on the billing page — edit the
    // invoice in a fresh tab if the active one has items.
    if (selectActiveCart(useCartStore.getState()).items.length > 0) cart.newTab()
    cart.loadInvoice(invoice)
    onClose?.()
    navigate('/billing')
  }

  if (!open) return null

  const hasGstSplit = !!invoice && ((invoice.sgst || 0) > 0 || (invoice.cgst || 0) > 0)
  const balance = invoice && invoice.paymentStatus === 'PAID' ? Math.round((invoice.total - netPaid) * 100) / 100 : 0
  const hasBalance = Math.abs(balance) >= 0.01

  return (
    <>
      <Modal open={open} onClose={onClose} title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'} width="560px">
        {isLoading || !invoice ? (
          <Spinner label="Loading invoice…" />
        ) : (
          <div>
            <div className="field-row" style={{ marginBottom: 12 }}>
              <span className={`badge ${STATUS_BADGE[invoice.paymentStatus] || 'badge-muted'}`}>
                {invoice.paymentStatus}
              </span>
              <span className="badge badge-muted">{invoice.status}</span>
              {invoice.customer?.name || invoice.customer?.phone ? (
                <span className="page-subtitle">
                  {invoice.customer.name} {invoice.customer.phone ? `— ${invoice.customer.phone}` : ''}
                </span>
              ) : null}
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td>{formatCurrency(item.price, currency)}</td>
                    <td>{formatCurrency(item.price * item.qty, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-block">
              <div>
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal, currency)}</span>
              </div>
              {hasGstSplit ? (
                <>
                  <div>
                    <span>SGST</span>
                    <span>{formatCurrency(invoice.sgst, currency)}</span>
                  </div>
                  <div>
                    <span>CGST</span>
                    <span>{formatCurrency(invoice.cgst, currency)}</span>
                  </div>
                </>
              ) : (
                <div>
                  <span>Tax</span>
                  <span>{formatCurrency(invoice.tax, currency)}</span>
                </div>
              )}
              {invoice.discount > 0 && (
                <div>
                  <span>Discount</span>
                  <span>-{formatCurrency(invoice.discount, currency)}</span>
                </div>
              )}
              <div className="totals-grand">
                <span>TOTAL</span>
                <span>{formatCurrency(invoice.total, currency)}</span>
              </div>
            </div>

            {payments.length > 0 && (
              <>
                <p className="page-subtitle" style={{ marginTop: 16 }}>Payment history</p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Type</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p._id || p.id}>
                        <td>{formatDateTime(p.createdAt)}</td>
                        <td>{p.method}</td>
                        <td>{p.type === 'REFUND' ? 'Refund' : 'Payment'}</td>
                        <td>{formatCurrency(p.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {invoice.paymentStatus === 'PAID' && hasBalance && (
              <p className="discount-hint-error" style={{ marginTop: 12 }}>
                {balance > 0
                  ? `Balance due: ${formatCurrency(balance, currency)}`
                  : `Refund owed: ${formatCurrency(Math.abs(balance), currency)}`}
              </p>
            )}

            <div className="modal-actions" style={{ marginTop: 20, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={handleEdit}>
                Edit
              </button>
              {invoice.paymentStatus === 'PENDING' && (
                <button className="btn btn-ghost btn-danger-text" onClick={() => setCancelConfirmOpen(true)}>
                  Cancel
                </button>
              )}
              {invoice.paymentStatus === 'PAID' && (
                <>
                  {hasBalance && (
                    <button className="btn btn-ghost" onClick={() => setSettleOpen(true)}>
                      Settle Balance
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => setRefundConfirmOpen(true)}>
                    Refund
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel invoice?"
        message="This invoice hasn't been paid yet — cancelling it releases it permanently."
        confirmLabel="Cancel Invoice"
        danger
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelConfirmOpen(false)}
      />

      <ConfirmDialog
        open={refundConfirmOpen}
        title="Refund this invoice?"
        message="This reverses stock and loyalty points earned on the original sale and marks the invoice REFUNDED. This cannot be undone."
        confirmLabel="Refund"
        danger
        onConfirm={() => refundMutation.mutate()}
        onCancel={() => setRefundConfirmOpen(false)}
      />

      <ApprovalPinModal
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        onApproved={handleApprovalApproved}
      />

      {invoice && (
        <SettleBalanceModal
          open={settleOpen}
          onClose={() => setSettleOpen(false)}
          invoice={invoice}
          currency={currency}
          direction={balance > 0 ? 'COLLECT' : 'REFUND'}
          amount={balance}
          onSettled={() => {
            setSettleOpen(false)
            invalidate()
          }}
        />
      )}
    </>
  )
}
