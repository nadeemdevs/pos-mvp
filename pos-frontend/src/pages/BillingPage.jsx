import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createInvoice, updateInvoice } from '../services/invoiceService'
import { getCustomers } from '../services/customerService'
import { takePayment } from '../services/paymentService'
import { getSettings } from '../services/settingsService'
import { useCartStore } from '../store/cartStore'
import { toast } from '../store/toastStore'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { computeRoundOff, formatCurrency } from '../utils/format'
import HeldBillsModal from '../components/HeldBillsModal'
import DineInBillsModal from '../components/DineInBillsModal'
import SplitBillModal from '../components/SplitBillModal'
import PaymentModal from '../components/PaymentModal'
import Receipt from '../components/Receipt'
import MenuPicker from '../components/MenuPicker'
import EmptyState from '../components/EmptyState'
import { useAuthStore } from '../store/authStore'

function CustomerLookup({ customer, onFieldChange, onSelect, onClear }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const phone = customer?.phone || ''
  const name = customer?.name || ''
  const debouncedPhone = useDebouncedValue(phone, 300)
  const trimmedPhone = debouncedPhone.trim()

  const { data } = useQuery({
    queryKey: ['customers', 'lookup', trimmedPhone],
    queryFn: () => getCustomers({ search: trimmedPhone, limit: 6 }),
    enabled: trimmedPhone.length >= 3,
  })
  const matches = Array.isArray(data) ? data : data?.items || []
  const exactMatch = matches.some((c) => c.phone === phone)
  const hasDetails = phone.trim().length > 0 || name.trim().length > 0

  const handlePhoneChange = (value) => {
    onFieldChange({ ...customer, phone: value })
    setDropdownOpen(value.trim().length >= 3)
  }

  const handleSelect = (c) => {
    onSelect({ name: c.name, phone: c.phone })
    setDropdownOpen(false)
  }

  return (
    <div>
      <div className="field-row customer-lookup-row">
        <label className="field customer-lookup">
          <span>Phone</span>
          <input
            value={phone}
            placeholder="Search or enter phone"
            onChange={(e) => handlePhoneChange(e.target.value)}
            onFocus={() => setDropdownOpen(phone.trim().length >= 3)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          />
          {dropdownOpen && matches.length > 0 && (
            <div className="customer-lookup-dropdown">
              {matches.map((c) => (
                <button
                  type="button"
                  key={c._id || c.id}
                  className="customer-lookup-item"
                  onMouseDown={() => handleSelect(c)}
                >
                  <span>{c.name}</span>
                  <span className="customer-lookup-item-phone">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="field">
          <span>Customer Name</span>
          <input
            value={name}
            onChange={(e) => onFieldChange({ ...customer, name: e.target.value })}
          />
        </label>
        {hasDetails && (
          <button
            type="button"
            className="customer-clear-btn"
            title="Remove customer"
            aria-label="Remove customer"
            onClick={onClear}
          >
            ×
          </button>
        )}
      </div>
      {hasDetails && !exactMatch && (
        <p className="customer-hint">New customer will be saved</p>
      )}
    </div>
  )
}

function DiscountEditor({ discountType, discountValue, presets, maxPercent, onSetType, onSetValue, onApplyPreset }) {
  const displayType = discountType || 'FLAT'
  const exceedsMax =
    displayType === 'PERCENT' &&
    maxPercent > 0 &&
    Number(discountValue) > Number(maxPercent)

  return (
    <div className="discount-block">
      <div className="field-row discount-input-row">
        <div className="discount-toggle">
          <button
            type="button"
            className={`toggle-btn btn-sm ${displayType === 'FLAT' ? 'active' : ''}`}
            onClick={() => onSetType('FLAT')}
          >
            ₹
          </button>
          <button
            type="button"
            className={`toggle-btn btn-sm ${displayType === 'PERCENT' ? 'active' : ''}`}
            onClick={() => onSetType('PERCENT')}
          >
            %
          </button>
        </div>
        <label className="field discount-value-field">
          <span>Discount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={discountValue || ''}
            onChange={(e) => onSetValue(e.target.value)}
          />
        </label>
      </div>

      {presets.length > 0 && (
        <div className="preset-chip-row">
          {presets.map((p, idx) => {
            const active = displayType === p.type && Number(discountValue) === Number(p.value)
            return (
              <button
                key={idx}
                type="button"
                className={`chip preset-chip ${active ? 'active' : ''}`}
                onClick={() => onApplyPreset(p)}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}

      {exceedsMax && <p className="discount-hint-error">Max {maxPercent}%</p>}
    </div>
  )
}

export default function BillingPage() {
  const queryClient = useQueryClient()
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [dineInModalOpen, setDineInModalOpen] = useState(false)
  const [splitOrder, setSplitOrder] = useState(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [paymentResult, setPaymentResult] = useState(null)

  const hasPermission = useAuthStore((s) => s.hasPermission)

  const cart = useCartStore()
  const items = useCartStore((s) => s.items)
  const discountType = useCartStore((s) => s.discountType)
  const discountValue = useCartStore((s) => s.discountValue)
  const customer = useCartStore((s) => s.customer)
  const note = useCartStore((s) => s.note)
  const heldInvoiceId = useCartStore((s) => s.heldInvoiceId)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'
  const maxPercent = settings?.discounts?.maxPercent
  const presets = settings?.discounts?.presets || []
  const dineInEnabled = !!settings?.features?.dineIn && hasPermission('billing.create')

  const subtotal = cart.getSubtotal()
  const tax = cart.getTax()
  const discountAmount = cart.getDiscountAmount()
  const total = cart.getTotal()
  const { rounded: displayTotal, roundOff } = computeRoundOff(total, settings?.rounding)

  const buildInvoicePayload = (status) => {
    const payload = {
      items: items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        taxRate: i.taxRate || 0,
      })),
      customer: customer?.name || customer?.phone ? customer : undefined,
      status,
    }
    if (discountType && discountValue) {
      payload.discountType = discountType
      payload.discountValue = discountValue
    }
    if (note) payload.note = note
    return payload
  }

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
    onSuccess: (data) => {
      // /payments/manual responds with { payment, invoice, change } —
      // the receipt wants the payment document itself
      setPaymentResult(data?.payment || data)
      setPaymentModalOpen(false)
      invalidateInvoices()
    },
    onError: (e) => toast(e.response?.data?.message || 'Payment failed', 'error'),
  })

  const handleCardSuccess = (payment) => {
    // Card payments are settled (and the invoice marked PAID) server-side by
    // the terminal flow, so we just surface the same success/receipt screen
    // used for cash/UPI instead of re-submitting via paymentMutation.
    setPaymentResult(payment)
    setPaymentModalOpen(false)
    invalidateInvoices()
  }

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

  const handleSetDiscountType = (type) => {
    cart.setDiscountType(type)
  }

  const handleSetDiscountValue = (value) => {
    if (!discountType) cart.setDiscountType('FLAT')
    cart.setDiscountValue(value)
  }

  const handleApplyPreset = (preset) => {
    cart.setDiscount(preset.type, preset.value)
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
        <MenuPicker
          currency={currency}
          onItemClick={(item) =>
            cart.add({
              menuItemId: item._id || item.id,
              name: item.name,
              price: item.price,
              taxRate: item.taxRate || 0,
            })
          }
        />
      </div>

      <div className="billing-right">
        <div className="cart-header">
          <h2>Current Bill</h2>
          <div className="cart-header-actions">
            {dineInEnabled && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDineInModalOpen(true)}>
                Dine-in Bills
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setHeldModalOpen(true)}>
              Held Bills
            </button>
          </div>
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
          <DiscountEditor
            discountType={discountType}
            discountValue={discountValue}
            presets={presets}
            maxPercent={maxPercent}
            onSetType={handleSetDiscountType}
            onSetValue={handleSetDiscountValue}
            onApplyPreset={handleApplyPreset}
          />

          <CustomerLookup
            customer={customer}
            onFieldChange={cart.setCustomer}
            onSelect={cart.setCustomer}
            onClear={() => cart.setCustomer({ name: '', phone: '' })}
          />

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
              <span>
                Discount
                {discountType === 'PERCENT' && discountValue ? ` (${discountValue}%)` : ''}
              </span>
              <span>-{formatCurrency(discountAmount, currency)}</span>
            </div>
            {roundOff !== 0 && (
              <div>
                <span>Round off</span>
                <span>
                  {roundOff > 0 ? '+' : ''}
                  {formatCurrency(roundOff, currency)}
                </span>
              </div>
            )}
            <div className="totals-grand">
              <span>TOTAL</span>
              <span>{formatCurrency(displayTotal, currency)}</span>
            </div>
          </div>

          <label className="field hold-note-field">
            <span>Note (optional)</span>
            <input
              placeholder="e.g. Table 4 uncle"
              value={note}
              onChange={(e) => cart.setNote(e.target.value)}
            />
          </label>

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
        settings={settings}
        isSubmitting={paymentMutation.isPending}
        onConfirm={(data) => paymentMutation.mutate(data)}
        onCardSuccess={handleCardSuccess}
      />

      {dineInEnabled && (
        <>
          <DineInBillsModal
            open={dineInModalOpen}
            onClose={() => setDineInModalOpen(false)}
            onSelectOrder={(order) => {
              setDineInModalOpen(false)
              setSplitOrder(order)
            }}
          />
          <SplitBillModal
            open={!!splitOrder}
            orderId={splitOrder?._id || splitOrder?.id}
            currency={currency}
            settings={settings}
            onClose={() => setSplitOrder(null)}
          />
        </>
      )}
    </div>
  )
}
