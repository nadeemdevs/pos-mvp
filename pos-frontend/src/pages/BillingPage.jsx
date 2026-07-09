import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCategories } from '../services/categoryService'
import { getMenuItems } from '../services/menuService'
import { createInvoice, updateInvoice } from '../services/invoiceService'
import { takePayment } from '../services/paymentService'
import { getSettings } from '../services/settingsService'
import { useCartStore } from '../store/cartStore'
import { toast } from '../store/toastStore'
import { formatCurrency } from '../utils/format'
import HeldBillsModal from '../components/HeldBillsModal'
import PaymentModal from '../components/PaymentModal'
import Receipt from '../components/Receipt'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

export default function BillingPage() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [paymentResult, setPaymentResult] = useState(null)

  const cart = useCartStore()
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const customer = useCartStore((s) => s.customer)
  const heldInvoiceId = useCartStore((s) => s.heldInvoiceId)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData?.items || []

  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['menu', 'billing', { category: categoryFilter, search }],
    queryFn: () =>
      getMenuItems({
        active: true,
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(search ? { search } : {}),
      }),
  })
  const menuItems = Array.isArray(menuData) ? menuData : menuData?.items || []

  const subtotal = cart.getSubtotal()
  const tax = cart.getTax()
  const total = cart.getTotal()

  const buildInvoicePayload = (status) => ({
    items: items.map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      taxRate: i.taxRate || 0,
    })),
    discount,
    customer: customer?.name || customer?.phone ? customer : undefined,
    status,
  })

  const invalidateInvoices = () =>
    queryClient.invalidateQueries({ queryKey: ['invoices'] })

  const holdMutation = useMutation({
    mutationFn: () => {
      const payload = buildInvoicePayload('HELD')
      return heldInvoiceId
        ? updateInvoice(heldInvoiceId, payload)
        : createInvoice(payload)
    },
    onSuccess: () => {
      toast('Bill held', 'success')
      cart.clear()
      invalidateInvoices()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to hold bill', 'error'),
  })

  const chargeMutation = useMutation({
    mutationFn: () => {
      const payload = buildInvoicePayload('OPEN')
      return heldInvoiceId
        ? updateInvoice(heldInvoiceId, payload)
        : createInvoice(payload)
    },
    onSuccess: (invoice) => {
      setActiveInvoice(invoice)
      setPaymentModalOpen(true)
      invalidateInvoices()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create invoice', 'error'),
  })

  const paymentMutation = useMutation({
    mutationFn: takePayment,
    onSuccess: (payment) => {
      setPaymentResult(payment)
      setPaymentModalOpen(false)
      invalidateInvoices()
    },
    onError: (e) => toast(e.response?.data?.message || 'Payment failed', 'error'),
  })

  const handleResume = (invoice) => {
    cart.loadInvoice(invoice)
    setHeldModalOpen(false)
    toast('Held bill resumed', 'success')
  }

  const handleNewSale = () => {
    cart.clear()
    setActiveInvoice(null)
    setPaymentResult(null)
  }

  if (paymentResult) {
    return (
      <div className="payment-success">
        <div className="printable-area">
          <Receipt invoice={activeInvoice} payment={paymentResult} settings={settings} />
        </div>
        <div className="payment-success-actions no-print">
          <h2>Payment Successful</h2>
          <p>Invoice {activeInvoice?.invoiceNumber} — {formatCurrency(activeInvoice?.total, currency)}</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => window.print()}>
              Print Receipt
            </button>
            <button className="btn btn-primary" onClick={handleNewSale}>
              New Sale
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="billing-page">
      <div className="billing-left">
        <div className="category-chips">
          <button
            className={`chip ${categoryFilter === '' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('')}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c._id || c.id}
              className={`chip ${categoryFilter === (c._id || c.id) ? 'active' : ''}`}
              onClick={() => setCategoryFilter(c._id || c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        <input
          className="billing-search"
          autoFocus
          placeholder="Search menu items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="menu-grid">
          {menuLoading ? (
            <Spinner label="Loading menu…" />
          ) : menuItems.length === 0 ? (
            <EmptyState title="No items found" />
          ) : (
            menuItems.map((item) => (
              <button
                key={item._id || item.id}
                className="menu-item-card"
                onClick={() =>
                  cart.add({
                    menuItemId: item._id || item.id,
                    name: item.name,
                    price: item.price,
                    taxRate: item.taxRate || 0,
                  })
                }
              >
                <span className="menu-item-name">{item.name}</span>
                <span className="menu-item-price">{formatCurrency(item.price, currency)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="billing-right">
        <div className="cart-header">
          <h2>Current Bill</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setHeldModalOpen(true)}>
            Held Bills
          </button>
        </div>

        <div className="cart-lines">
          {items.length === 0 ? (
            <EmptyState title="Cart is empty" message="Tap a menu item to add it." />
          ) : (
            items.map((item) => (
              <div key={item.menuItemId} className="cart-line">
                <div className="cart-line-info">
                  <span className="cart-line-name">{item.name}</span>
                  <span className="cart-line-price">{formatCurrency(item.price, currency)} each</span>
                </div>
                <div className="cart-line-controls">
                  <button className="stepper-btn" onClick={() => cart.decrement(item.menuItemId)}>
                    −
                  </button>
                  <span className="stepper-qty">{item.qty}</span>
                  <button className="stepper-btn" onClick={() => cart.increment(item.menuItemId)}>
                    +
                  </button>
                </div>
                <span className="cart-line-total">
                  {formatCurrency(item.price * item.qty, currency)}
                </span>
                <button
                  className="cart-line-remove"
                  onClick={() => cart.remove(item.menuItemId)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="field-row">
            <label className="field">
              <span>Discount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => cart.setDiscount(e.target.value)}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Customer Name</span>
              <input
                value={customer?.name || ''}
                onChange={(e) => cart.setCustomer({ ...customer, name: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                value={customer?.phone || ''}
                onChange={(e) => cart.setCustomer({ ...customer, phone: e.target.value })}
              />
            </label>
          </div>

          <div className="totals-block">
            <div>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            <div>
              <span>Tax</span>
              <span>{formatCurrency(tax, currency)}</span>
            </div>
            <div>
              <span>Discount</span>
              <span>-{formatCurrency(discount, currency)}</span>
            </div>
            <div className="totals-grand">
              <span>TOTAL</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
          </div>

          <div className="cart-actions">
            <button
              className="btn btn-ghost btn-block"
              disabled={items.length === 0 || holdMutation.isPending}
              onClick={() => holdMutation.mutate()}
            >
              Hold Bill
            </button>
            <button
              className="btn btn-primary btn-block"
              disabled={items.length === 0 || chargeMutation.isPending}
              onClick={() => chargeMutation.mutate()}
            >
              Charge
            </button>
          </div>
        </div>
      </div>

      <HeldBillsModal
        open={heldModalOpen}
        onClose={() => setHeldModalOpen(false)}
        onResume={handleResume}
      />

      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        invoice={activeInvoice}
        currency={currency}
        isSubmitting={paymentMutation.isPending}
        onConfirm={(data) => paymentMutation.mutate(data)}
      />
    </div>
  )
}
