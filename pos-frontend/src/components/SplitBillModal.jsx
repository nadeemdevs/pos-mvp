import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './Modal'
import PaymentModal from './PaymentModal'
import Spinner from './Spinner'
import { getOrder, billOrder } from '../services/orderService'
import { takePayment } from '../services/paymentService'
import { formatCurrency } from '../utils/format'
import { toast } from '../store/toastStore'
import { useSocketEvents } from '../hooks/useSocketEvents'

const TABS = [
  { id: 'FULL', label: 'Full Bill' },
  { id: 'ITEMS', label: 'Split by Items' },
  { id: 'EQUAL', label: 'Split Equally' },
]

// Generates one or more invoices for a dine-in order (full / by-item groups
// / N equal ways), then lets the cashier take payment against each invoice
// using the existing PaymentModal — one order can settle across several
// invoices before the table is freed.
export default function SplitBillModal({ open, orderId, currency, settings, onClose }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('FULL')
  const [groupCount, setGroupCount] = useState(2)
  const [itemGroups, setItemGroups] = useState({}) // itemId -> group number (1-based)
  const [ways, setWays] = useState(2)
  const [invoices, setInvoices] = useState(null)
  const [paidIds, setPaidIds] = useState([])
  const [paymentTarget, setPaymentTarget] = useState(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setTab('FULL')
      setGroupCount(2)
      setItemGroups({})
      setWays(2)
      setInvoices(null)
      setPaidIds([])
      setPaymentTarget(null)
      setPaymentModalOpen(false)
    }
  }, [open, orderId])

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => getOrder(orderId),
    enabled: open && !!orderId && !invoices,
  })

  const items = order?.items || []
  const total = order?.total || 0

  const billMutation = useMutation({
    mutationFn: (payload) => billOrder(orderId, payload),
    onSuccess: (data) => {
      const list = Array.isArray(data?.invoices) ? data.invoices : Array.isArray(data) ? data : []
      setInvoices(list)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to generate bill', 'error'),
  })

  const paymentMutation = useMutation({
    mutationFn: takePayment,
    onSuccess: () => {
      markPaid(paymentTarget)
      setPaymentModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (e) => toast(e.response?.data?.message || 'Payment failed', 'error'),
  })

  const markPaid = (invoice) => {
    const id = invoice?._id || invoice?.id
    if (!id) return
    setPaidIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const handleCardSuccess = () => {
    markPaid(paymentTarget)
    setPaymentModalOpen(false)
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  useSocketEvents({
    'payment.completed': (payload) => {
      const invId = payload?.invoiceId || payload?.invoice?._id || payload?.invoice?.id
      setInvoices((current) => {
        if (invId && current?.some((inv) => (inv._id || inv.id) === invId)) {
          setPaidIds((prev) => (prev.includes(invId) ? prev : [...prev, invId]))
        }
        return current
      })
    },
  })

  const allPaid =
    !!invoices && invoices.length > 0 && invoices.every((inv) => paidIds.includes(inv._id || inv.id))

  useEffect(() => {
    if (allPaid) {
      const t = setTimeout(() => onClose(), 1500)
      return () => clearTimeout(t)
    }
  }, [allPaid, onClose])

  const assignGroup = (itemId, group) => {
    setItemGroups((prev) => ({ ...prev, [itemId]: group }))
  }

  const itemsAssigned = items.length > 0 && items.every((it) => !!itemGroups[it._id || it.id])

  const equalShare = ways > 0 ? total / ways : 0

  const handleSubmit = () => {
    if (tab === 'FULL') {
      billMutation.mutate({ mode: 'FULL' })
    } else if (tab === 'ITEMS') {
      const groups = {}
      items.forEach((it) => {
        const id = it._id || it.id
        const g = itemGroups[id]
        if (!g) return
        groups[g] = groups[g] || []
        groups[g].push(id)
      })
      billMutation.mutate({ mode: 'ITEMS', splits: Object.values(groups) })
    } else {
      billMutation.mutate({ mode: 'EQUAL', ways })
    }
  }

  const openPayment = (invoice) => {
    setPaymentTarget(invoice)
    setPaymentModalOpen(true)
  }

  const renderCompose = () => (
    <>
      <div className="tabs split-bill-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Loading order…" />
      ) : (
        <>
          {tab === 'FULL' && (
            <div className="split-full-summary">
              <p>Generate a single invoice for the entire order.</p>
              <div className="totals-grand split-bill-total">
                <span>TOTAL</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>
          )}

          {tab === 'ITEMS' && (
            <div className="split-items-block">
              <div className="split-items-list">
                {items.map((it) => {
                  const id = it._id || it.id
                  return (
                    <div key={id} className="split-item-row">
                      <span className="split-item-name">
                        {it.qty} × {it.name}
                      </span>
                      <span className="split-item-price">{formatCurrency(it.price * it.qty, currency)}</span>
                      <select
                        value={itemGroups[id] || ''}
                        onChange={(e) => assignGroup(id, Number(e.target.value))}
                      >
                        <option value="">Group…</option>
                        {Array.from({ length: groupCount }, (_, i) => i + 1).map((g) => (
                          <option key={g} value={g}>
                            Split {g}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setGroupCount((c) => c + 1)}
              >
                + Add split
              </button>
              {!itemsAssigned && (
                <p className="discount-hint-error">Assign every item to a split before continuing.</p>
              )}
            </div>
          )}

          {tab === 'EQUAL' && (
            <div className="split-equal-block">
              <label className="field split-ways-field">
                <span>Split into how many ways?</span>
                <div className="cart-line-controls">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setWays((w) => Math.max(2, w - 1))}
                  >
                    −
                  </button>
                  <span className="stepper-qty">{ways}</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setWays((w) => Math.min(10, w + 1))}
                  >
                    +
                  </button>
                </div>
              </label>
              <p className="split-equal-preview">
                {ways} invoices of {formatCurrency(equalShare, currency)} each
              </p>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                billMutation.isPending ||
                items.length === 0 ||
                (tab === 'ITEMS' && !itemsAssigned)
              }
              onClick={handleSubmit}
            >
              {billMutation.isPending ? 'Generating…' : 'Generate Bill'}
            </button>
          </div>
        </>
      )}
    </>
  )

  const renderInvoices = () => (
    <div>
      {allPaid ? (
        <div className="split-settled">
          <h3>Order settled — table freed</h3>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const id = inv._id || inv.id
              const paid = paidIds.includes(id)
              return (
                <tr key={id}>
                  <td>{inv.invoiceNumber || id}</td>
                  <td>{formatCurrency(inv.total, currency)}</td>
                  <td>
                    {paid ? (
                      <span className="badge badge-success">Paid ✓</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => openPayment(inv)}>
                        Take Payment
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title="Generate Bill" width="600px">
      {invoices ? renderInvoices() : renderCompose()}

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        invoice={paymentTarget}
        currency={currency}
        settings={settings}
        isSubmitting={paymentMutation.isPending}
        onConfirm={(data) => paymentMutation.mutate(data)}
        onCardSuccess={handleCardSuccess}
      />
    </Modal>
  )
}
