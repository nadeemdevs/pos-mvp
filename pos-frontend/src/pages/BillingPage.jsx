import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Palette, Percent, StickyNote, User } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createInvoice, updateInvoice } from '../services/invoiceService'
import { takePayment } from '../services/paymentService'
import { getSettings } from '../services/settingsService'
import { getCurrentShift } from '../services/shiftService'
import { setApprovalToken } from '../services/api'
import { useCartStore, selectActiveCart } from '../store/cartStore'
import { useBranchStore } from '../store/branchStore'
import { toast } from '../store/toastStore'
import { computeRoundOff, formatCurrency, splitTax } from '../utils/format'
import HeldBillsModal from '../components/HeldBillsModal'
import DineInBillsModal from '../components/DineInBillsModal'
import SplitBillModal from '../components/SplitBillModal'
import PaymentModal from '../components/PaymentModal'
import Receipt from '../components/Receipt'
import MenuPicker from '../components/MenuPicker'
import BillingTabs from '../components/BillingTabs'
import EmptyState from '../components/EmptyState'
import CustomerLookup from '../components/CustomerLookup'
import ApprovalPinModal from '../components/ApprovalPinModal'
import BranchRequiredNotice from '../components/BranchRequiredNotice'
import { useAuthStore } from '../store/authStore'

const MENU_COLORS_KEY = 'billingMenuColors'

function DiscountEditor({ discountType, discountValue, presets, maxPercent, onSetType, onSetValue, onApplyPreset }) {
  const displayType = discountType || 'FLAT'
  const exceedsMax =
    displayType === 'PERCENT' &&
    maxPercent > 0 &&
    Number(discountValue) > Number(maxPercent)

  return (
    <div className="discount-block field ">
        <span className=''>Discount</span>
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
          {/* <span>Discount</span> */}
          <input
            type="number"
            min="0"
            placeholder='Discount'
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
  const activeBranch = useBranchStore((s) => s.activeBranch)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [dineInModalOpen, setDineInModalOpen] = useState(false)
  const [splitOrder, setSplitOrder] = useState(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [paymentResult, setPaymentResult] = useState(null)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [approvalAction, setApprovalAction] = useState(null) // 'charge' | 'saveEdit'
  const chargedTabIdRef = useRef(null)
  // Pastel menu-card tints — a per-device cashier preference, on by default.
  const [menuColors, setMenuColors] = useState(
    () => localStorage.getItem(MENU_COLORS_KEY) !== '0'
  )
  // The cart list is the cashier's main focus — discount/customer/note are
  // secondary, opened one at a time from a compact chip row, and the tax
  // breakdown is collapsed behind the TOTAL row. Keeps the footer short so
  // the item list gets the vertical space.
  const [openPanel, setOpenPanel] = useState(null) // 'discount' | 'customer' | 'note' | null
  const [totalsExpanded, setTotalsExpanded] = useState(false)
  const togglePanel = (panel) => setOpenPanel((cur) => (cur === panel ? null : panel))

  const toggleMenuColors = () => {
    setMenuColors((on) => {
      try {
        localStorage.setItem(MENU_COLORS_KEY, on ? '0' : '1')
      } catch {
        // localStorage may be unavailable (private mode); non-fatal.
      }
      return !on
    })
  }

  const hasPermission = useAuthStore((s) => s.hasPermission)

  const cart = useCartStore()
  const items = useCartStore((s) => selectActiveCart(s).items)
  const discountType = useCartStore((s) => selectActiveCart(s).discountType)
  const discountValue = useCartStore((s) => selectActiveCart(s).discountValue)
  const customer = useCartStore((s) => selectActiveCart(s).customer)
  const note = useCartStore((s) => selectActiveCart(s).note)
  const heldInvoiceId = useCartStore((s) => selectActiveCart(s).heldInvoiceId)
  const loadedPaymentStatus = useCartStore((s) => selectActiveCart(s).loadedPaymentStatus)
  const loadedInvoiceNumber = useCartStore((s) => selectActiveCart(s).loadedInvoiceNumber)
  const isEditingPaid = loadedPaymentStatus === 'PAID'

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'
  const maxPercent = settings?.discounts?.maxPercent
  const presets = settings?.discounts?.presets || []
  const dineInEnabled = !!settings?.features?.dineIn && hasPermission('billing.create')

  // Non-blocking cash-reconciliation nudge — only fetched when shifts are on
  // and the user manages them; degrades silently on any error (404 when no
  // shift is open is expected, not a failure).
  const shiftsFeatureOn = !!settings?.features?.shifts && hasPermission('shifts.manage')
  const { data: currentShiftData } = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: getCurrentShift,
    enabled: shiftsFeatureOn,
    retry: false,
  })
  const hasOpenShift = !!(currentShiftData?.shift || currentShiftData?._id)
  const showNoShiftBanner = shiftsFeatureOn && !hasOpenShift

  const subtotal = cart.getSubtotal()
  const tax = cart.getTax()
  const gstSplitEnabled = settings?.country === 'India'
  const { sgst, cgst } = splitTax(tax)
  const discountAmount = cart.getDiscountAmount()
  const total = cart.getTotal()
  const { rounded: displayTotal, roundOff } = computeRoundOff(total, settings?.rounding)

  // `status` is omitted (not even sent as undefined-status) when saving edits
  // to an already-paid invoice — sending status:'OPEN' there would flip it
  // back from CLOSED while paymentStatus stays PAID, a combination nothing
  // else in the app expects.
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
    }
    if (status) payload.status = status
    if (discountType && discountValue) {
      payload.discountType = discountType
      payload.discountValue = discountValue
    }
    if (note) payload.note = note
    return payload
  }

  // A 403 (billing.refund required) or the pre-existing max-discount 400
  // both mean "a manager needs to approve this" — same challenge, different
  // trigger, so both paths open the same PIN modal.
  const needsApproval = (e) => {
    const status = e.response?.status
    const message = e.response?.data?.message || ''
    return status === 403 || (status === 400 && /discount exceeds/i.test(message))
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
      // Remember which tab this invoice came from — the cashier may switch
      // tabs (Alt+1..9) before finishing payment, and New Sale must clear the
      // charged tab, not whichever one is active by then.
      chargedTabIdRef.current = useCartStore.getState().activeTabId
      setActiveInvoice(invoice)
      setPaymentModalOpen(true)
      invalidateInvoices()
    },
    onError: (e) => {
      const message = e.response?.data?.message || 'Failed to create invoice'
      if (needsApproval(e)) {
        setApprovalAction('charge')
        setApprovalModalOpen(true)
        return
      }
      toast(message, 'error')
    },
  })

  const saveEditMutation = useMutation({
    mutationFn: () => updateInvoice(heldInvoiceId, buildInvoicePayload()),
    onSuccess: () => {
      toast('Invoice updated', 'success')
      cart.clear()
      invalidateInvoices()
      navigate('/invoices')
    },
    onError: (e) => {
      const message = e.response?.data?.message || 'Failed to save changes'
      if (needsApproval(e)) {
        setApprovalAction('saveEdit')
        setApprovalModalOpen(true)
        return
      }
      toast(message, 'error')
    },
  })

  const handleApprovalApproved = (token) => {
    setApprovalToken(token)
    setApprovalModalOpen(false)
    if (approvalAction === 'saveEdit') {
      saveEditMutation.mutate()
    } else {
      chargeMutation.mutate()
    }
  }

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

  if (activeBranch === 'all') {
    return <BranchRequiredNotice />
  }

  const handleCardSuccess = (payment) => {
    // Card payments are settled (and the invoice marked PAID) server-side by
    // the terminal flow, so we just surface the same success/receipt screen
    // used for cash/UPI instead of re-submitting via paymentMutation.
    setPaymentResult(payment)
    setPaymentModalOpen(false)
    invalidateInvoices()
  }

  const handleResume = (invoice) => {
    // Resume into the current tab only if it's idle; otherwise open the held
    // bill in a fresh tab so the in-progress order isn't overwritten.
    if (items.length > 0) cart.newTab()
    cart.loadInvoice(invoice)
    setHeldModalOpen(false)
    toast('Held bill resumed', 'success')
  }

  const handleNewSale = () => {
    cart.clear(chargedTabIdRef.current)
    chargedTabIdRef.current = null
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
      <BillingTabs />
      <div className="billing-body">
      <div className="billing-left">
        <MenuPicker
          currency={currency}
          colorful={menuColors}
          inCartIds={items.map((i) => i.menuItemId)}
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
        {showNoShiftBanner && (
          <div className="banner banner-warning">
            <span>No shift open — cash reconciliation is off</span>
            <Link to="/shifts" className="banner-link">
              Open a shift
            </Link>
          </div>
        )}
        {isEditingPaid && (
          <div className="banner banner-warning">
            <span>
              Editing paid invoice {loadedInvoiceNumber} — stock and loyalty points already applied for the
              original sale are not automatically adjusted.
            </span>
          </div>
        )}
        <div className="cart-header">
          <h2>Current Bill</h2>
          <div className="cart-header-actions">
            <button
              className={`btn btn-ghost btn-sm menu-colors-toggle${menuColors ? ' active' : ''}`}
              title={menuColors ? 'Disable menu colors' : 'Enable menu colors'}
              onClick={toggleMenuColors}
            >
              <Palette size={16} />
            </button>
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
          <div className="cart-addon-chips">
            <button
              type="button"
              className={`chip cart-addon-chip ${openPanel === 'discount' || discountAmount > 0 ? 'active' : ''}`}
              onClick={() => togglePanel('discount')}
            >
              <Percent size={13} />
              {discountAmount > 0
                ? `-${formatCurrency(discountAmount, currency)}`
                : 'Discount'}
            </button>
            <button
              type="button"
              className={`chip cart-addon-chip ${openPanel === 'customer' || customer?.name || customer?.phone ? 'active' : ''}`}
              onClick={() => togglePanel('customer')}
            >
              <User size={13} />
              {customer?.name || customer?.phone || 'Customer'}
            </button>
            <button
              type="button"
              className={`chip cart-addon-chip ${openPanel === 'note' || note ? 'active' : ''}`}
              onClick={() => togglePanel('note')}
            >
              <StickyNote size={13} />
              {note ? 'Note ✓' : 'Note'}
            </button>
          </div>

          {openPanel === 'discount' && (
            <DiscountEditor
              discountType={discountType}
              discountValue={discountValue}
              presets={presets}
              maxPercent={maxPercent}
              onSetType={handleSetDiscountType}
              onSetValue={handleSetDiscountValue}
              onApplyPreset={handleApplyPreset}
            />
          )}

          {openPanel === 'customer' && (
            <CustomerLookup
              customer={customer}
              onFieldChange={cart.setCustomer}
              onSelect={cart.setCustomer}
              onClear={() => cart.setCustomer({ name: '', phone: '' })}
            />
          )}

          {openPanel === 'note' && (
            <label className="field hold-note-field">
              <span>Note (optional)</span>
              <input
                autoFocus
                placeholder="e.g. Table 4 uncle"
                value={note}
                onChange={(e) => cart.setNote(e.target.value)}
              />
            </label>
          )}

          <div className="totals-block">
            {totalsExpanded && (
              <>
                <div>
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                {gstSplitEnabled ? (
                  <>
                    <div>
                      <span>SGST</span>
                      <span>{formatCurrency(sgst, currency)}</span>
                    </div>
                    <div>
                      <span>CGST</span>
                      <span>{formatCurrency(cgst, currency)}</span>
                    </div>
                  </>
                ) : (
                  <div>
                    <span>Tax</span>
                    <span>{formatCurrency(tax, currency)}</span>
                  </div>
                )}
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
              </>
            )}
            <button
              type="button"
              className="totals-grand totals-grand-toggle"
              onClick={() => setTotalsExpanded((e) => !e)}
              title={totalsExpanded ? 'Hide breakdown' : 'Show breakdown'}
            >
              <span>
                TOTAL
                {totalsExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </span>
              <span>{formatCurrency(displayTotal, currency)}</span>
            </button>
          </div>

          <div className="cart-actions">
            {isEditingPaid ? (
              <button
                className="btn btn-primary btn-block"
                disabled={items.length === 0 || saveEditMutation.isPending}
                onClick={() => saveEditMutation.mutate()}
              >
                Save Changes
              </button>
            ) : (
              <>
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
              </>
            )}
          </div>
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
        onInvoiceUpdate={setActiveInvoice}
      />

      <ApprovalPinModal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        onApproved={handleApprovalApproved}
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
