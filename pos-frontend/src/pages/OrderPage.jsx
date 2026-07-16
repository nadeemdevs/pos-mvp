import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addOrderItems,
  cancelOrder,
  getOrder,
  removeOrderItem,
  requestBill,
  sendKot,
  updateOrderItem,
} from '../services/orderService'
import { getKots } from '../services/kotService'
import { getSettings } from '../services/settingsService'
import { useAuthStore } from '../store/authStore'
import { useSocketEvents } from '../hooks/useSocketEvents'
import { toast } from '../store/toastStore'
import { formatCurrency, splitTax } from '../utils/format'
import MenuPicker from '../components/MenuPicker'
import ItemModifierModal from '../components/ItemModifierModal'
import ConfirmDialog from '../components/ConfirmDialog'
import SplitBillModal from '../components/SplitBillModal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const STATUS_LABEL = {
  OPEN: 'Open',
  BILL_REQUESTED: 'Bill Requested',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}

const STATUS_BADGE = {
  OPEN: 'badge-muted',
  BILL_REQUESTED: 'badge-warning',
  INVOICED: 'badge-info',
  PAID: 'badge-success',
  CLOSED: 'badge-success',
  CANCELLED: 'badge-danger',
}

const KOT_STATUS_LABEL = {
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
}

export default function OrderPage() {
  const { id: orderId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const [modifierItem, setModifierItem] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // 'bill' | 'cancel' | null
  const [splitOpen, setSplitOpen] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'
  const gstSplitEnabled = settings?.country === 'India'

  const orderQueryKey = ['orders', orderId]

  const { data: order, isLoading } = useQuery({
    queryKey: orderQueryKey,
    queryFn: () => getOrder(orderId),
    enabled: !!orderId,
  })

  const items = order?.items || []
  const newItems = items.filter((i) => !i.kotId)
  const sentItems = items.filter((i) => i.kotId)
  const hasSentItems = sentItems.length > 0

  const { data: kotsData } = useQuery({
    queryKey: ['kots', 'all'],
    queryFn: () => getKots({ statuses: 'NEW,PREPARING,READY,SERVED,CANCELLED' }),
    enabled: hasSentItems,
  })
  const kotList = Array.isArray(kotsData) ? kotsData : kotsData?.items || []
  const kotById = {}
  kotList.forEach((k) => {
    kotById[k._id || k.id] = k
  })

  const sentGroups = {}
  sentItems.forEach((item) => {
    sentGroups[item.kotId] = sentGroups[item.kotId] || []
    sentGroups[item.kotId].push(item)
  })

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: orderQueryKey })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  useSocketEvents({
    'order.updated': invalidateOrder,
    'order.closed': invalidateOrder,
    'kot.updated': () => {
      invalidateOrder()
      queryClient.invalidateQueries({ queryKey: ['kots'] })
    },
  })

  const addItemsMutation = useMutation({
    mutationFn: (payload) => addOrderItems(orderId, payload),
    onSuccess: invalidateOrder,
    onError: (e) => toast(e.response?.data?.message || 'Failed to add item', 'error'),
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }) => updateOrderItem(orderId, itemId, data),
    onSuccess: invalidateOrder,
    onError: (e) => toast(e.response?.data?.message || 'Failed to update item', 'error'),
  })

  const removeItemMutation = useMutation({
    mutationFn: (itemId) => removeOrderItem(orderId, itemId),
    onSuccess: invalidateOrder,
    onError: (e) => toast(e.response?.data?.message || 'Failed to remove item', 'error'),
  })

  const sendKotMutation = useMutation({
    mutationFn: () => sendKot(orderId),
    onSuccess: (data) => {
      invalidateOrder()
      queryClient.invalidateQueries({ queryKey: ['kots'] })
      toast(`${data?.kot?.kotNumber || 'KOT'} sent`, 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to send KOT', 'error'),
  })

  const requestBillMutation = useMutation({
    mutationFn: () => requestBill(orderId),
    onSuccess: () => {
      invalidateOrder()
      toast('Bill requested', 'success')
      setConfirmAction(null)
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to request bill', 'error')
      setConfirmAction(null)
    },
  })

  const cancelOrderMutation = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => {
      toast('Order cancelled', 'success')
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      navigate('/tables')
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to cancel order', 'error')
      setConfirmAction(null)
    },
  })

  const billRequested = ['BILL_REQUESTED', 'INVOICED', 'PAID', 'CLOSED'].includes(order?.status)
  const isCancellable = order && !['CLOSED', 'CANCELLED', 'PAID'].includes(order.status)

  // Rapid taps must not race each other: each op waits for the previous one
  // (and its refetch) so add-vs-increment is always decided on fresh data.
  const opChain = useRef(Promise.resolve())
  const enqueueItemOp = (fn) => {
    opChain.current = opChain.current.then(fn, fn)
  }

  const handleMenuItemClick = (item) => {
    const hasModifiers = Array.isArray(item.modifiers) && item.modifiers.length > 0
    if (hasModifiers) {
      setModifierItem(item)
      return
    }
    const menuItemId = item._id || item.id
    enqueueItemOp(async () => {
      try {
        const fresh = queryClient.getQueryData(orderQueryKey) || order
        const existing = (fresh?.items || []).find(
          (i) =>
            !i.kotId &&
            i.menuItemId === menuItemId &&
            (!i.modifiers || i.modifiers.length === 0) &&
            !i.note,
        )
        if (existing) {
          await updateOrderItem(orderId, existing._id, { qty: existing.qty + 1 })
        } else {
          await addOrderItems(orderId, [{ menuItemId, qty: 1, modifiers: [] }])
        }
        await queryClient.refetchQueries({ queryKey: orderQueryKey })
      } catch (e) {
        toast(e.response?.data?.message || 'Failed to add item', 'error')
        invalidateOrder()
      }
    })
  }

  const handleAddWithModifiers = (payload) => {
    addItemsMutation.mutate([payload])
  }

  const changeQty = (item, delta) => {
    const nextQty = item.qty + delta
    if (nextQty < 1) return
    updateItemMutation.mutate({ itemId: item._id, data: { qty: nextQty } })
  }

  const startEditNote = (item) => {
    setEditingNoteId(item._id)
    setNoteDraft(item.note || '')
  }

  const saveNote = (item) => {
    updateItemMutation.mutate({ itemId: item._id, data: { note: noteDraft.trim() || undefined } })
    setEditingNoteId(null)
  }

  const unfiredCount = newItems.reduce((sum, i) => sum + i.qty, 0)

  if (isLoading) return <Spinner label="Loading order…" />
  if (!order) return <EmptyState title="Order not found" />

  return (
    <div className="order-page">
      <div className="order-left">
        {billRequested ? (
          <div className="order-billed-placeholder">
            <EmptyState
              title="Bill requested"
              message="No further items can be added to this order."
            />
          </div>
        ) : (
          <MenuPicker currency={currency} onItemClick={handleMenuItemClick} />
        )}
      </div>

      <div className="order-right">
        <div className="order-header">
          <div>
            <h2>{order.tableName || 'Order'}</h2>
            <p className="order-header-meta">
              {order.orderNumber} · {order.guestCount} guest{order.guestCount === 1 ? '' : 's'}
            </p>
          </div>
          <span className={`badge ${STATUS_BADGE[order.status] || 'badge-muted'}`}>
            {STATUS_LABEL[order.status] || order.status}
          </span>
        </div>

        {billRequested && (
          <div className="order-banner">Bill requested — take payment at counter</div>
        )}

        <div className="order-items">
          <div className="order-items-group">
            <h3 className="order-items-group-title">New</h3>
            {newItems.length === 0 ? (
              <p className="order-items-empty">No unfired items.</p>
            ) : (
              newItems.map((item) => (
                <div key={item._id} className="order-item-line">
                  <div className="order-item-main">
                    <div className="cart-line-controls">
                      <button className="stepper-btn" onClick={() => changeQty(item, -1)}>
                        −
                      </button>
                      <span className="stepper-qty">{item.qty}</span>
                      <button className="stepper-btn" onClick={() => changeQty(item, 1)}>
                        +
                      </button>
                    </div>
                    <span className="order-item-name">{item.name}</span>
                    <span className="order-item-total">
                      {formatCurrency(
                        (item.price +
                          (item.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0)) *
                          item.qty,
                        currency,
                      )}
                    </span>
                    <button
                      className="cart-line-remove"
                      aria-label="Remove"
                      onClick={() => removeItemMutation.mutate(item._id)}
                    >
                      ×
                    </button>
                  </div>
                  {(item.modifiers || []).map((m) => (
                    <div key={m.name} className="order-item-modifier">
                      + {m.name} {formatCurrency(m.price, currency)}
                    </div>
                  ))}
                  {editingNoteId === item._id ? (
                    <div className="order-item-note-edit">
                      <input
                        autoFocus
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveNote(item)}
                      />
                      <button className="btn btn-ghost btn-sm" onClick={() => saveNote(item)}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <button className="order-item-note-btn" onClick={() => startEditNote(item)}>
                      {item.note ? `Note: ${item.note}` : '+ Add note'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {hasSentItems && (
            <div className="order-items-group">
              <h3 className="order-items-group-title">Sent to kitchen</h3>
              {Object.entries(sentGroups).map(([kotId, kotItems]) => {
                const kot = kotById[kotId]
                return (
                  <div key={kotId} className="order-kot-group">
                    <div className="order-kot-group-header">
                      <span>{kot?.kotNumber || 'KOT'}</span>
                      <span className={`status-pill status-pill-${(kot?.status || 'sent').toLowerCase()}`}>
                        {KOT_STATUS_LABEL[kot?.status] || 'Sent'}
                      </span>
                    </div>
                    {kotItems.map((item) => (
                      <div key={item._id} className="order-item-line order-item-line-readonly">
                        <div className="order-item-main">
                          <span className="stepper-qty">{item.qty}×</span>
                          <span className="order-item-name">{item.name}</span>
                          <span className="order-item-total">
                            {formatCurrency(item.price * item.qty, currency)}
                          </span>
                        </div>
                        {(item.modifiers || []).map((m) => (
                          <div key={m.name} className="order-item-modifier">
                            + {m.name} {formatCurrency(m.price, currency)}
                          </div>
                        ))}
                        {item.note && <div className="order-item-note-readonly">{item.note}</div>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="order-footer">
          <div className="totals-block">
            <div>
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, currency)}</span>
            </div>
            {gstSplitEnabled ? (
              <>
                <div>
                  <span>SGST</span>
                  <span>{formatCurrency(splitTax(order.tax).sgst, currency)}</span>
                </div>
                <div>
                  <span>CGST</span>
                  <span>{formatCurrency(splitTax(order.tax).cgst, currency)}</span>
                </div>
              </>
            ) : (
              <div>
                <span>Tax</span>
                <span>{formatCurrency(order.tax, currency)}</span>
              </div>
            )}
            <div className="totals-grand">
              <span>TOTAL</span>
              <span>{formatCurrency(order.total, currency)}</span>
            </div>
          </div>

          {!billRequested && (
            <div className="order-actions">
              <button
                className="btn btn-primary btn-block"
                disabled={unfiredCount === 0 || sendKotMutation.isPending}
                onClick={() => sendKotMutation.mutate()}
              >
                Send KOT ({unfiredCount})
              </button>
              <div className="order-actions-row">
                <button
                  className="btn btn-ghost btn-block"
                  disabled={requestBillMutation.isPending}
                  onClick={() => setConfirmAction('bill')}
                >
                  Request Bill
                </button>
                {isCancellable && (
                  <button
                    className="btn btn-ghost btn-block btn-danger-text"
                    disabled={cancelOrderMutation.isPending}
                    onClick={() => setConfirmAction('cancel')}
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          )}

          {hasPermission('billing.create') && (
            <button className="btn btn-primary btn-block order-generate-bill" onClick={() => setSplitOpen(true)}>
              Generate Bill
            </button>
          )}
        </div>
      </div>

      <ItemModifierModal
        open={!!modifierItem}
        item={modifierItem}
        currency={currency}
        onClose={() => setModifierItem(null)}
        onAdd={handleAddWithModifiers}
      />

      <ConfirmDialog
        open={confirmAction === 'bill'}
        title="Request Bill"
        message="Ask the counter to prepare the bill for this table?"
        confirmLabel="Request Bill"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => requestBillMutation.mutate()}
      />

      <ConfirmDialog
        open={confirmAction === 'cancel'}
        title="Cancel Order"
        message="Cancel this entire order? This cannot be undone."
        confirmLabel="Cancel Order"
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => cancelOrderMutation.mutate()}
      />

      {hasPermission('billing.create') && (
        <SplitBillModal
          open={splitOpen}
          orderId={orderId}
          currency={currency}
          settings={settings}
          onClose={() => setSplitOpen(false)}
        />
      )}
    </div>
  )
}
