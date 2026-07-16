import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  createPublicOrder,
  getPublicMenu,
  getPublicOrderStatus,
  getPublicTable,
} from '../../services/publicOrderService'
import { formatCurrency } from '../../utils/format'
import Spinner from '../../components/Spinner'

function storageKey(qrToken) {
  return `qr-order:${qrToken}`
}

function getStoredOrder(qrToken) {
  try {
    const raw = localStorage.getItem(storageKey(qrToken))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setStoredOrder(qrToken, order) {
  try {
    localStorage.setItem(storageKey(qrToken), JSON.stringify(order))
  } catch {
    /* ignore quota/private-mode errors */
  }
}

function clearStoredOrder(qrToken) {
  try {
    localStorage.removeItem(storageKey(qrToken))
  } catch {
    /* ignore */
  }
}

// Public, unauthenticated QR-ordering page. Mounted OUTSIDE the protected
// app shell/router tree (see app/router.jsx) so it never requires login and
// never gets redirected to /login. A guest scans a table's QR code, browses
// the menu, builds a cart, and places an order that lands as unfired KOT
// lines for staff. Reloading the page (or coming back later) restores the
// live status screen from localStorage instead of re-showing the menu.
export default function QrOrderPage() {
  const { qrToken } = useParams()
  const [view, setView] = useState('menu') // 'menu' | 'cart' | 'status'
  const [cart, setCart] = useState([]) // [{menuItemId, name, price, qty, modifiers:[{name,price}], note}]
  const [modifierItem, setModifierItem] = useState(null)
  const [customer, setCustomer] = useState({ name: '', phone: '' })
  const [activeOrder, setActiveOrder] = useState(() => getStoredOrder(qrToken))
  const [placeError, setPlaceError] = useState('')

  const tableQuery = useQuery({
    queryKey: ['public', 'table', qrToken],
    queryFn: () => getPublicTable(qrToken),
    retry: false,
    enabled: !!qrToken,
  })

  const disabledFeature = tableQuery.isError && tableQuery.error?.response?.status === 403
  const tableNotFound = tableQuery.isError && !disabledFeature

  const menuQuery = useQuery({
    queryKey: ['public', 'menu', qrToken],
    queryFn: () => getPublicMenu(qrToken),
    retry: false,
    enabled: !!qrToken && !disabledFeature,
  })

  useEffect(() => {
    if (activeOrder) setView('status')
  }, [activeOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  // The public menu comes back as an array of categories each carrying its
  // own nested `items`; also tolerate a flat {categories, items} envelope.
  const { categories, items } = useMemo(() => {
    const data = menuQuery.data
    if (Array.isArray(data)) {
      return {
        categories: data.map(({ items: _items, ...cat }) => cat),
        items: data.flatMap((cat) =>
          (cat.items || []).map((it) => ({ ...it, categoryId: it.categoryId || cat._id }))
        ),
      }
    }
    return {
      categories: Array.isArray(data?.categories) ? data.categories : [],
      items: Array.isArray(data?.items) ? data.items : [],
    }
  }, [menuQuery.data])

  const restaurantName = menuQuery.data?.restaurantName || 'Menu'

  const cartCount = cart.reduce((sum, l) => sum + l.qty, 0)
  const cartTotal = cart.reduce((sum, l) => {
    const modTotal = (l.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0)
    return sum + (l.price + modTotal) * l.qty
  }, 0)

  const addSimpleItem = (item) => {
    const menuItemId = item._id || item.id
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === menuItemId && !l.modifiers?.length && !l.note)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { menuItemId, name: item.name, price: Number(item.price) || 0, qty: 1, modifiers: [], note: '' }]
    })
  }

  const addModifiedItem = (line) => {
    setCart((prev) => [...prev, line])
  }

  const updateLineQty = (idx, qty) => {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((_, i) => i !== idx)
      const next = [...prev]
      next[idx] = { ...next[idx], qty }
      return next
    })
  }

  const handleItemTap = (item) => {
    if (Array.isArray(item.modifiers) && item.modifiers.length > 0) {
      setModifierItem(item)
    } else {
      addSimpleItem(item)
    }
  }

  // Total quantity per menu item across all cart lines (an item customised
  // with different modifiers/notes spans several lines) — drives the in-cart
  // stroke and the +/- stepper on each menu card.
  const cartQtyByItem = useMemo(() => {
    const map = new Map()
    for (const line of cart) {
      map.set(line.menuItemId, (map.get(line.menuItemId) || 0) + line.qty)
    }
    return map
  }, [cart])

  // "−" on a menu card: decrement the most recently added line for that item
  // (drop the line when it hits zero).
  const decrementItem = (item) => {
    const menuItemId = item._id || item.id
    setCart((prev) => {
      const idx = prev.findLastIndex((l) => l.menuItemId === menuItemId)
      if (idx < 0) return prev
      if (prev[idx].qty <= 1) return prev.filter((_, i) => i !== idx)
      const next = [...prev]
      next[idx] = { ...next[idx], qty: next[idx].qty - 1 }
      return next
    })
  }

  const handlePlaceOrder = async () => {
    setPlaceError('')
    try {
      const payload = {
        qrToken,
        customer: { name: customer.name.trim(), phone: customer.phone.trim() },
        items: cart.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifiers: (l.modifiers || []).map((m) => ({ name: m.name })),
          note: l.note || undefined,
        })),
      }
      const result = await createPublicOrder(payload)
      const stored = {
        orderId: result.orderId,
        statusToken: result.statusToken,
        orderNumber: result.orderNumber,
      }
      setStoredOrder(qrToken, stored)
      setActiveOrder(stored)
      setCart([])
      setView('status')
    } catch (e) {
      const status = e.response?.status
      const message = e.response?.data?.message
      if (status === 409) {
        setPlaceError(message || 'This table has already been billed. Please ask staff for help.')
      } else if (status === 403) {
        setPlaceError('Online ordering is unavailable.')
      } else {
        setPlaceError(message || 'Could not place your order. Please try again.')
      }
    }
  }

  const handleOrderMore = () => {
    setView('menu')
  }

  const handleNewOrderReset = () => {
    clearStoredOrder(qrToken)
    setActiveOrder(null)
    setView('menu')
  }

  if (tableQuery.isLoading) {
    return (
      <div className="qr-page qr-page-centered">
        <Spinner label="Loading table…" />
      </div>
    )
  }

  if (disabledFeature) {
    return (
      <div className="qr-page qr-page-centered">
        <div className="qr-error-card">
          <h2>Online ordering is unavailable</h2>
          <p>Please speak to a staff member to place your order.</p>
        </div>
      </div>
    )
  }

  if (tableNotFound) {
    return (
      <div className="qr-page qr-page-centered">
        <div className="qr-error-card">
          <h2>Table not found</h2>
          <p>This QR code is no longer valid. Please ask staff for a fresh one.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="qr-page">
      <header className="qr-header">
        <div className="qr-header-title">{restaurantName}</div>
        {tableQuery.data?.tableName && (
          <div className="qr-header-table">Table {tableQuery.data.tableName}</div>
        )}
      </header>

      <main className="qr-main">
        {view === 'status' && activeOrder && (
          <StatusView
            activeOrder={activeOrder}
            onOrderMore={handleOrderMore}
            onReset={handleNewOrderReset}
          />
        )}

        {view === 'menu' && (
          <MenuView
            loading={menuQuery.isLoading}
            error={menuQuery.isError}
            categories={categories}
            items={items}
            onItemTap={handleItemTap}
            cartQtyByItem={cartQtyByItem}
            onDecrement={decrementItem}
          />
        )}

        {view === 'cart' && (
          <CartView
            cart={cart}
            customer={customer}
            setCustomer={setCustomer}
            updateLineQty={updateLineQty}
            onBack={() => setView('menu')}
            onPlaceOrder={handlePlaceOrder}
            error={placeError}
          />
        )}
      </main>

      {view === 'menu' && cartCount > 0 && (
        <button type="button" className="qr-cart-bar" onClick={() => setView('cart')}>
          <span>{cartCount} item{cartCount > 1 ? 's' : ''}</span>
          <span>{formatCurrency(cartTotal)}</span>
          <span>View Cart →</span>
        </button>
      )}

      <QrModifierModal item={modifierItem} onClose={() => setModifierItem(null)} onAdd={addModifiedItem} />
    </div>
  )
}

function MenuView({ loading, error, categories, items, onItemTap, cartQtyByItem, onDecrement }) {
  const [categoryFilter, setCategoryFilter] = useState('')

  if (loading) return <Spinner label="Loading menu…" />
  if (error) {
    return (
      <div className="qr-error-card">
        <h2>Could not load the menu</h2>
        <p>Please refresh, or ask a staff member for help.</p>
      </div>
    )
  }

  const filtered = categoryFilter
    ? items.filter((i) => {
        const catId = i.categoryId || i.category
        if (catId == null) return true
        return String(catId) === String(categoryFilter)
      })
    : items

  return (
    <>
      {categories.length > 0 && (
        <div className="qr-category-scroller">
          <button
            type="button"
            className={`chip qr-chip ${categoryFilter === '' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('')}
          >
            All
          </button>
          {categories.map((c) => {
            const id = typeof c === 'string' ? c : c._id || c.id
            const name = typeof c === 'string' ? c : c.name
            return (
              <button
                key={id}
                type="button"
                className={`chip qr-chip ${categoryFilter === id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(id)}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="qr-error-card">
          <h2>No items available</h2>
        </div>
      ) : (
        <div className="qr-item-list">
          {filtered.map((item) => {
            const id = item._id || item.id
            const qty = cartQtyByItem?.get(id) || 0
            return (
              // A div with button semantics rather than a <button> — the
              // in-card qty stepper needs real <button>s inside, and buttons
              // can't nest.
              <div
                key={id}
                role="button"
                tabIndex={0}
                className={`qr-item-row${qty > 0 ? ' in-cart' : ''}`}
                onClick={() => onItemTap(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onItemTap(item)
                  }
                }}
              >
                <span className="qr-item-info">
                  <span className="qr-item-name">{item.name}</span>
                  {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                    <span className="qr-item-modifier-hint">{item.modifiers.length} options</span>
                  )}
                </span>
                <span className="qr-item-right">
                  {qty > 0 && (
                    <span className="qr-item-stepper" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => onDecrement(item)}
                      >
                        −
                      </button>
                      <span className="stepper-qty">{qty}</span>
                      <button
                        type="button"
                        className="stepper-btn"
                        aria-label={`Add one ${item.name}`}
                        onClick={() => onItemTap(item)}
                      >
                        +
                      </button>
                    </span>
                  )}
                  <span className="qr-item-price">{formatCurrency(item.price)}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function QrModifierModal({ item, onClose, onAdd }) {
  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (item) {
      setSelected([])
      setNote('')
      setQty(1)
    }
  }, [item])

  if (!item) return null

  const modifiers = Array.isArray(item.modifiers) ? item.modifiers : []

  const toggle = (mod) => {
    setSelected((prev) =>
      prev.some((m) => m.name === mod.name) ? prev.filter((m) => m.name !== mod.name) : [...prev, mod],
    )
  }

  const modTotal = selected.reduce((sum, m) => sum + (Number(m.price) || 0), 0)
  const unitPrice = (Number(item.price) || 0) + modTotal

  const handleAdd = () => {
    onAdd({
      menuItemId: item._id || item.id,
      name: item.name,
      price: Number(item.price) || 0,
      qty,
      modifiers: selected.map((m) => ({ name: m.name, price: Number(m.price) || 0 })),
      note: note.trim(),
    })
    onClose()
  }

  return (
    <div className="qr-sheet-overlay" onMouseDown={onClose}>
      <div className="qr-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="qr-sheet-handle" />
        <h3 className="qr-sheet-title">{item.name}</h3>

        <div className="qr-sheet-modifiers">
          {modifiers.map((mod) => (
            <label key={mod.name} className="qr-modifier-row">
              <span className="modifier-row-check">
                <input type="checkbox" checked={selected.some((m) => m.name === mod.name)} onChange={() => toggle(mod)} />
                <span>{mod.name}</span>
              </span>
              {mod.price ? <span>+{formatCurrency(mod.price)}</span> : null}
            </label>
          ))}
        </div>

        <label className="field">
          <span>Note (optional)</span>
          <input placeholder="e.g. Less spicy" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="modifier-qty-row">
          <span>Quantity</span>
          <div className="cart-line-controls">
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span className="stepper-qty">{qty}</span>
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => q + 1)}>
              +
            </button>
          </div>
        </div>

        <div className="qr-sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleAdd}>
            Add · {formatCurrency(unitPrice * qty)}
          </button>
        </div>
      </div>
    </div>
  )
}

function CartView({ cart, customer, setCustomer, updateLineQty, onBack, onPlaceOrder, error }) {
  const [submitting, setSubmitting] = useState(false)

  const total = cart.reduce((sum, l) => {
    const modTotal = (l.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0)
    return sum + (l.price + modTotal) * l.qty
  }, 0)

  const canSubmit = cart.length > 0 && customer.phone.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    await onPlaceOrder()
    setSubmitting(false)
  }

  return (
    <div className="qr-cart-view">
      <button type="button" className="qr-back-link" onClick={onBack}>
        ← Back to menu
      </button>

      {cart.length === 0 ? (
        <div className="qr-error-card">
          <h2>Your cart is empty</h2>
        </div>
      ) : (
        <div className="qr-item-list">
          {cart.map((line, idx) => {
            const modTotal = (line.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0)
            const lineTotal = (line.price + modTotal) * line.qty
            return (
              <div key={idx} className="qr-cart-line">
                <div className="qr-cart-line-info">
                  <span className="qr-item-name">{line.name}</span>
                  {(line.modifiers || []).map((m) => (
                    <span key={m.name} className="qr-cart-line-modifier">
                      + {m.name}
                    </span>
                  ))}
                  {line.note && <span className="qr-cart-line-note">"{line.note}"</span>}
                  <span className="qr-item-price">{formatCurrency(lineTotal)}</span>
                </div>
                <div className="cart-line-controls">
                  <button type="button" className="stepper-btn" onClick={() => updateLineQty(idx, line.qty - 1)}>
                    −
                  </button>
                  <span className="stepper-qty">{line.qty}</span>
                  <button type="button" className="stepper-btn" onClick={() => updateLineQty(idx, line.qty + 1)}>
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="qr-customer-fields">
        <label className="field">
          <span>Name (optional)</span>
          <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Phone *</span>
          <input
            required
            type="tel"
            inputMode="tel"
            value={customer.phone}
            onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
          />
        </label>
      </div>

      {error && <p className="qr-error-text">{error}</p>}

      <div className="qr-cart-total-row">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>

      <button type="button" className="btn btn-primary qr-place-order-btn" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? 'Placing order…' : 'Place Order'}
      </button>
    </div>
  )
}

const KOT_STATUS_LABELS = {
  PENDING: 'Pending',
  FIRED: 'Fired',
  IN_PROGRESS: 'Cooking',
  READY: 'Ready',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
}

function StatusView({ activeOrder, onOrderMore, onReset }) {
  const statusQuery = useQuery({
    queryKey: ['public', 'order-status', activeOrder.orderId],
    queryFn: () => getPublicOrderStatus(activeOrder.orderId, activeOrder.statusToken),
    refetchInterval: 5000,
    retry: false,
  })

  const data = statusQuery.data
  const invalidOrder = statusQuery.isError

  if (invalidOrder) {
    return (
      <div className="qr-error-card">
        <h2>Could not load your order</h2>
        <p>The link may have expired.</p>
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          Start a new order
        </button>
      </div>
    )
  }

  return (
    <div className="qr-status-view">
      <div className="qr-status-header">
        <h2>Order {data?.orderNumber || activeOrder.orderNumber}</h2>
        <span className="badge badge-success">Placed</span>
      </div>

      {statusQuery.isLoading ? (
        <Spinner label="Loading order status…" />
      ) : (
        <>
          <div className="qr-item-list">
            {(data?.items || []).map((item, idx) => (
              <div key={idx} className="qr-status-item-row">
                <span>
                  {item.qty} × {item.name}
                </span>
                <span className={`badge badge-muted qr-kot-status-${(item.kotStatus || '').toLowerCase()}`}>
                  {KOT_STATUS_LABELS[item.kotStatus] || item.kotStatus || 'Pending'}
                </span>
              </div>
            ))}
          </div>

          <div className="qr-cart-total-row">
            <span>Subtotal</span>
            <span>{formatCurrency(data?.subtotal)}</span>
          </div>
          <div className="qr-cart-total-row">
            <span>Tax</span>
            <span>{formatCurrency(data?.tax)}</span>
          </div>
          <div className="qr-cart-total-row qr-cart-total-row-strong">
            <span>Total</span>
            <span>{formatCurrency(data?.total)}</span>
          </div>
        </>
      )}

      <button type="button" className="btn btn-primary qr-place-order-btn" onClick={onOrderMore}>
        Order more
      </button>
    </div>
  )
}
