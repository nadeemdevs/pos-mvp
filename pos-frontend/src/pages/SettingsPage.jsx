import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CreditCard,
  Gift,
  Printer,
  QrCode,
  ReceiptText,
  SlidersHorizontal,
  Store,
} from 'lucide-react'
import { getSettings, updateSettings, uploadLogo } from '../services/settingsService'
import { getInitials } from '../utils/initials'
import { testPrint } from '../services/printService'
import { createBranch, getBranches, updateBranch } from '../services/branchService'
import { setApprovalPin } from '../services/approvalService'
import { changePassword } from '../services/authService'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import InvoiceTemplateDesigner from '../components/InvoiceTemplateDesigner'

// Maps each nav entry to its icon and label. All of these live inside the
// single shared <form> — they're rendered/hidden by conditionally showing
// their JSX, never unmounted from the form, so the shared save button covers
// all of them — except 'branches', which is an independent, self-contained
// card with its own save flow (see BranchesCard below). Account/Data-Export/
// Approvals are folded into 'general'/'features' respectively (see their
// render sites) and self-gate on permission rather than hiding a whole tab.
const SETTINGS_SECTIONS = [
  { key: 'general', label: 'General', icon: Store },
  { key: 'checkout', label: 'Checkout', icon: CreditCard },
  { key: 'features', label: 'Features', icon: SlidersHorizontal },
  { key: 'online', label: 'Online & Delivery', icon: QrCode },
  { key: 'loyalty', label: 'Loyalty', icon: Gift },
  { key: 'printing', label: 'Printing', icon: Printer },
  { key: 'invoiceTemplate', label: 'Invoice Template', icon: ReceiptText },
  { key: 'branches', label: 'Branches', icon: Building2, permission: 'branches.manage' },
]

const SHARED_FORM_SECTIONS = new Set([
  'general',
  'checkout',
  'features',
  'online',
  'loyalty',
  'printing',
])

const emptyForm = {
  restaurantName: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  taxRate: '',
  currency: 'INR',
  country: 'India',
  receiptFooter: '',
}

const PROVIDER_OPTIONS = [
  { code: 'MOCK', label: 'Mock Terminal' },
  { code: 'PINELABS', label: 'Pine Labs' },
  { code: 'WORLDLINE', label: 'Worldline' },
]

const emptyPaymentProviders = {
  enabled: [],
  mock: { delayMs: 3000, outcome: 'SUCCESS' },
  pinelabs: { merchantId: '', securityToken: '', storeId: '', clientId: '', imei: '', baseUrl: '' },
  worldline: { merchantCode: '', terminalId: '', securityToken: '', baseUrl: '' },
}

const emptyDiscounts = { maxPercent: '', presets: [] }
const emptyRounding = { enabled: false, nearest: 1 }
const emptyFeatures = {
  dineIn: false,
  inventory: false,
  crm: false,
  loyalty: false,
  analytics: false,
  reservations: false,
  shifts: false,
  onlineOrdering: false,
}
const emptyPrintTarget = { provider: 'BROWSER', host: '', port: '' }
const emptyPrinting = { kot: { ...emptyPrintTarget }, receipt: { ...emptyPrintTarget } }
const emptyLoyalty = { pointsPer100: '', pointValue: '', referralBonus: '', tiers: [] }
const emptyDelivery = {
  zomato: { enabled: false, secret: '' },
  swiggy: { enabled: false, secret: '' },
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [activeSection, setActiveSection] = useState('general')
  const [form, setForm] = useState(emptyForm)
  const [paymentProviders, setPaymentProviders] = useState(emptyPaymentProviders)
  const [discounts, setDiscounts] = useState(emptyDiscounts)
  const [rounding, setRounding] = useState(emptyRounding)
  const [features, setFeatures] = useState(emptyFeatures)
  const [printing, setPrinting] = useState(emptyPrinting)
  const [loyalty, setLoyalty] = useState(emptyLoyalty)
  const [delivery, setDelivery] = useState(emptyDelivery)
  const [browserTestPayload, setBrowserTestPayload] = useState(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')

  const visibleSections = SETTINGS_SECTIONS.filter(
    (s) => !s.permission || hasPermission(s.permission)
  )

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  useEffect(() => {
    if (data) {
      setForm({
        restaurantName: data.restaurantName || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        taxRate: data.taxRate ?? '',
        currency: data.currency || 'INR',
        country: data.country || 'India',
        receiptFooter: data.receiptFooter || '',
      })
      setPaymentProviders({
        enabled: data.paymentProviders?.enabled || [],
        mock: { ...emptyPaymentProviders.mock, ...data.paymentProviders?.mock },
        pinelabs: { ...emptyPaymentProviders.pinelabs, ...data.paymentProviders?.pinelabs },
        worldline: { ...emptyPaymentProviders.worldline, ...data.paymentProviders?.worldline },
      })
      // settings.discounts / settings.rounding may not exist yet on older
      // backends, so fall back to sane empty defaults.
      setDiscounts({
        maxPercent: data.discounts?.maxPercent ?? '',
        presets: data.discounts?.presets || [],
      })
      setRounding({
        enabled: data.rounding?.enabled ?? false,
        nearest: data.rounding?.nearest ?? 1,
      })
      // features / printing are new in Phase 4 — older settings documents
      // simply won't have them yet. inventory/crm/loyalty/analytics are new
      // in Phase 5.
      setFeatures({
        dineIn: data.features?.dineIn ?? false,
        inventory: data.features?.inventory ?? false,
        crm: data.features?.crm ?? false,
        loyalty: data.features?.loyalty ?? false,
        analytics: data.features?.analytics ?? false,
        reservations: data.features?.reservations ?? false,
        shifts: data.features?.shifts ?? false,
        onlineOrdering: data.features?.onlineOrdering ?? false,
      })
      setPrinting({
        kot: { ...emptyPrintTarget, ...data.printing?.kot },
        receipt: { ...emptyPrintTarget, ...data.printing?.receipt },
      })
      setLoyalty({
        pointsPer100: data.loyalty?.pointsPer100 ?? '',
        pointValue: data.loyalty?.pointValue ?? '',
        referralBonus: data.loyalty?.referralBonus ?? '',
        tiers: data.loyalty?.tiers || [],
      })
      // settings.delivery is new in Phase 5.3 — older documents won't have it.
      setDelivery({
        zomato: { ...emptyDelivery.zomato, ...data.delivery?.zomato },
        swiggy: { ...emptyDelivery.swiggy, ...data.delivery?.swiggy },
      })
    }
  }, [data])

  useEffect(() => {
    const clear = () => setBrowserTestPayload(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast('Settings saved', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to save settings', 'error'),
  })

  const logoMutation = useMutation({
    mutationFn: uploadLogo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast('Logo updated', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to upload logo', 'error'),
  })

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    logoMutation.mutate(file)
    e.target.value = ''
  }

  const toggleProvider = (code) => {
    setPaymentProviders((prev) => {
      const isEnabled = prev.enabled.includes(code)
      return {
        ...prev,
        enabled: isEnabled ? prev.enabled.filter((c) => c !== code) : [...prev.enabled, code],
      }
    })
  }

  const updateProviderField = (providerKey, field, value) => {
    setPaymentProviders((prev) => ({
      ...prev,
      [providerKey]: { ...prev[providerKey], [field]: value },
    }))
  }

  const addPreset = () => {
    setDiscounts((prev) => ({
      ...prev,
      presets: [...prev.presets, { label: '', type: 'PERCENT', value: 0 }],
    }))
  }

  const updatePreset = (idx, field, value) => {
    setDiscounts((prev) => ({
      ...prev,
      presets: prev.presets.map((p, i) => (i === idx ? { ...p, [field]: value } : p)),
    }))
  }

  const removePreset = (idx) => {
    setDiscounts((prev) => ({
      ...prev,
      presets: prev.presets.filter((_, i) => i !== idx),
    }))
  }

  const addTier = () => {
    setLoyalty((prev) => ({
      ...prev,
      tiers: [...prev.tiers, { name: '', minPoints: 0 }],
    }))
  }

  const updateTier = (idx, field, value) => {
    setLoyalty((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    }))
  }

  const removeTier = (idx) => {
    setLoyalty((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== idx),
    }))
  }

  const pinMutation = useMutation({
    mutationFn: () => setApprovalPin(pin),
    onSuccess: () => {
      toast('Manager PIN updated', 'success')
      setPin('')
      setPinConfirm('')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update PIN', 'error'),
  })

  const handlePinSubmit = (e) => {
    e.preventDefault()
    if (pin !== pinConfirm) {
      toast('PINs do not match', 'error')
      return
    }
    pinMutation.mutate()
  }

  const updateDeliveryField = (partnerKey, field, value) => {
    setDelivery((prev) => ({
      ...prev,
      [partnerKey]: { ...prev[partnerKey], [field]: value },
    }))
  }

  const updatePrintTarget = (section, field, value) => {
    setPrinting((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }))
  }

  const testPrintMutation = useMutation({
    mutationFn: (target) => testPrint(target),
    onSuccess: (result, target) => {
      if (result?.printed) {
        toast(`Test print sent (${target})`, 'success')
      } else if (result?.payload) {
        setBrowserTestPayload(result.payload)
        toast(`Test ${target} ticket rendered — check the print preview`, 'info')
        setTimeout(() => window.print(), 60)
      } else {
        toast(`Test print (${target}) requested`, 'success')
      }
    },
    onError: (e) => toast(e.response?.data?.message || 'Test print failed', 'error'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({
      ...form,
      taxRate: Number(form.taxRate) || 0,
      // Spread whatever the server currently has for each section first,
      // then layer the edited fields on top, so we never clobber keys this
      // form doesn't know about (or other unrelated settings keys).
      paymentProviders: {
        ...(data?.paymentProviders || {}),
        ...paymentProviders,
      },
      discounts: {
        ...(data?.discounts || {}),
        maxPercent: Number(discounts.maxPercent) || 0,
        presets: discounts.presets.map((p) => ({
          label: p.label,
          type: p.type,
          value: Number(p.value) || 0,
        })),
      },
      rounding: {
        ...(data?.rounding || {}),
        enabled: rounding.enabled,
        nearest: Number(rounding.nearest) || 0,
      },
      // Spread the whole edited features object on top of whatever the
      // server currently has, so unrelated/future feature keys this form
      // doesn't know about are preserved (non-clobbering merge).
      features: {
        ...(data?.features || {}),
        ...features,
      },
      printing: {
        ...(data?.printing || {}),
        kot: {
          ...(data?.printing?.kot || {}),
          provider: printing.kot.provider,
          host: printing.kot.host,
          port: printing.kot.port ? Number(printing.kot.port) : undefined,
        },
        receipt: {
          ...(data?.printing?.receipt || {}),
          provider: printing.receipt.provider,
          host: printing.receipt.host,
          port: printing.receipt.port ? Number(printing.receipt.port) : undefined,
        },
      },
      loyalty: {
        ...(data?.loyalty || {}),
        pointsPer100: Number(loyalty.pointsPer100) || 0,
        pointValue: Number(loyalty.pointValue) || 0,
        referralBonus: Number(loyalty.referralBonus) || 0,
        tiers: loyalty.tiers.map((t) => ({
          name: t.name,
          minPoints: Number(t.minPoints) || 0,
        })),
      },
      delivery: {
        ...(data?.delivery || {}),
        zomato: { ...(data?.delivery?.zomato || {}), ...delivery.zomato },
        swiggy: { ...(data?.delivery?.swiggy || {}), ...delivery.swiggy },
      },
    })
  }

  if (isLoading) return <Spinner label="Loading settings…" />

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      {/* <p className="page-subtitle">Restaurant profile and defaults</p> */}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {visibleSections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              title={label}
              className={'settings-nav-item' + (activeSection === key ? ' active' : '')}
              onClick={() => setActiveSection(key)}
            >
              <Icon size={18} className="settings-nav-icon" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
      <form onSubmit={handleSubmit}>
        {activeSection === 'general' && (
        <div>
          {/* <h2>General</h2> */}

          <div className="settings-section-panel">
            <div className="settings-section-header">
              <h3>Restaurant Profile</h3>
            </div>
            <div className="logo-upload-row">
              <div className="logo-avatar">
                {data?.logoUrl ? (
                  <img src={data.logoUrl} alt="Restaurant icon" />
                ) : (
                  <span>{getInitials(form.restaurantName) || 'R'}</span>
                )}
              </div>
              <label className="btn btn-ghost btn-sm logo-upload-btn">
                {logoMutation.isPending ? 'Uploading…' : 'Upload Icon'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleLogoChange}
                  disabled={logoMutation.isPending}
                />
              </label>
            </div>
            <div className="settings-field-grid settings-field-grid-3">
              <label className="field">
                <span>Restaurant Name</span>
                <input
                  value={form.restaurantName}
                  onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Country</span>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                >
                  <option value="India">India</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Website (optional)</span>
                <input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Address</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
            </div>
            {/* UNCOMMENT FOR MULTI-COUNTRY SUPPORT */}
            {/* {form.country === 'India' && (
              <p className="field-hint">
                Tax will be shown as two equal halves — SGST + CGST — on the bill and receipt instead of one lump "Tax" line.
              </p>
            )} */}
          </div>

          <div className="settings-section-panel">
            <div className="settings-section-header">
              <h3>Business Details</h3>
            </div>
            <div className="settings-field-grid">
              <label className="field">
                <span>Default Tax Rate %</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </label>
            </div>
          </div>
        </div>
        )}

        {activeSection === 'checkout' && (
        <div className="card settings-form payment-terminals-card">
          <h2>Payment Terminals</h2>
          <p className="page-subtitle">
            Enable the card-terminal providers available at checkout. Mock Terminal is for
            development/testing only — it simulates a terminal without any real hardware.
          </p>

          {PROVIDER_OPTIONS.map(({ code, label }) => {
            const isEnabled = paymentProviders.enabled.includes(code)
            return (
              <details key={code} className="provider-config" open={isEnabled}>
                <summary className="provider-config-summary">
                  <label className="checkbox-field" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleProvider(code)}
                    />
                    <span>{label}</span>
                  </label>
                </summary>

                {code === 'MOCK' && (
                  <div className="provider-config-body">
                    <div className="field-row">
                      <label className="field">
                        <span>Delay (ms)</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={paymentProviders.mock.delayMs}
                          onChange={(e) => updateProviderField('mock', 'delayMs', Number(e.target.value) || 0)}
                        />
                      </label>
                      <label className="field">
                        <span>Simulated Outcome</span>
                        <select
                          value={paymentProviders.mock.outcome}
                          onChange={(e) => updateProviderField('mock', 'outcome', e.target.value)}
                        >
                          <option value="SUCCESS">SUCCESS</option>
                          <option value="FAILED">FAILED</option>
                          <option value="TIMEOUT">TIMEOUT</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}

                {code === 'PINELABS' && (
                  <div className="provider-config-body">
                    <div className="field-row">
                      <label className="field">
                        <span>Merchant ID</span>
                        <input
                          value={paymentProviders.pinelabs.merchantId}
                          onChange={(e) => updateProviderField('pinelabs', 'merchantId', e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Security Token</span>
                        <input
                          type="password"
                          value={paymentProviders.pinelabs.securityToken}
                          onChange={(e) => updateProviderField('pinelabs', 'securityToken', e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span>Store ID</span>
                        <input
                          value={paymentProviders.pinelabs.storeId}
                          onChange={(e) => updateProviderField('pinelabs', 'storeId', e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Client ID</span>
                        <input
                          value={paymentProviders.pinelabs.clientId}
                          onChange={(e) => updateProviderField('pinelabs', 'clientId', e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>IMEI</span>
                        <input
                          value={paymentProviders.pinelabs.imei}
                          onChange={(e) => updateProviderField('pinelabs', 'imei', e.target.value)}
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Base URL</span>
                      <input
                        value={paymentProviders.pinelabs.baseUrl}
                        onChange={(e) => updateProviderField('pinelabs', 'baseUrl', e.target.value)}
                      />
                    </label>
                  </div>
                )}

                {code === 'WORLDLINE' && (
                  <div className="provider-config-body">
                    <div className="field-row">
                      <label className="field">
                        <span>Merchant Code</span>
                        <input
                          value={paymentProviders.worldline.merchantCode}
                          onChange={(e) => updateProviderField('worldline', 'merchantCode', e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Terminal ID</span>
                        <input
                          value={paymentProviders.worldline.terminalId}
                          onChange={(e) => updateProviderField('worldline', 'terminalId', e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span>Security Token</span>
                        <input
                          type="password"
                          value={paymentProviders.worldline.securityToken}
                          onChange={(e) => updateProviderField('worldline', 'securityToken', e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Base URL</span>
                        <input
                          value={paymentProviders.worldline.baseUrl}
                          onChange={(e) => updateProviderField('worldline', 'baseUrl', e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </details>
            )
          })}
        </div>
        )}

        {activeSection === 'checkout' && (
        <>
        <div className="card settings-form">
          <h2>Discount Rules</h2>
          <label className="field">
            <span>Max Discount % (Admin exempt)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={discounts.maxPercent}
              onChange={(e) => setDiscounts({ ...discounts, maxPercent: e.target.value })}
            />
          </label>

          <span className="field-label">Presets</span>
          {discounts.presets.map((p, idx) => (
            <div className="preset-row" key={idx}>
              <input
                className="preset-row-label"
                placeholder="Label"
                value={p.label}
                onChange={(e) => updatePreset(idx, 'label', e.target.value)}
              />
              <select value={p.type} onChange={(e) => updatePreset(idx, 'type', e.target.value)}>
                <option value="FLAT">₹ Flat</option>
                <option value="PERCENT">% Percent</option>
              </select>
              <input
                className="preset-row-value"
                type="number"
                min="0"
                step="0.01"
                value={p.value}
                onChange={(e) => updatePreset(idx, 'value', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger-text"
                onClick={() => removePreset(idx)}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPreset}>
            + Add preset
          </button>
        </div>

        <div className="card settings-form">
          <h2>Rounding</h2>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rounding.enabled}
              onChange={(e) => setRounding({ ...rounding, enabled: e.target.checked })}
            />
            <span>Round totals to the nearest</span>
          </label>
          <label className="field">
            <span>Nearest ₹</span>
            <input
              type="number"
              min="0"
              step="1"
              disabled={!rounding.enabled}
              value={rounding.nearest}
              onChange={(e) => setRounding({ ...rounding, nearest: e.target.value })}
            />
          </label>
          <p className="page-subtitle">Round totals to the nearest ₹1</p>
        </div>
        </>
        )}

        {activeSection === 'features' && (
        <div className="card settings-form">
          <h2>Features</h2>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.dineIn}
              onChange={(e) => setFeatures({ ...features, dineIn: e.target.checked })}
            />
            <span>Enable Dine-in mode (tables, waiter ordering, kitchen display)</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.inventory}
              onChange={(e) => setFeatures({ ...features, inventory: e.target.checked })}
            />
            <span>Enable Inventory (stock, recipes, purchasing)</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.crm}
              onChange={(e) => setFeatures({ ...features, crm: e.target.checked })}
            />
            <span>Enable CRM</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.loyalty}
              onChange={(e) => setFeatures({ ...features, loyalty: e.target.checked })}
            />
            <span>Enable Loyalty</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.analytics}
              onChange={(e) => setFeatures({ ...features, analytics: e.target.checked })}
            />
            <span>Enable Analytics</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.reservations}
              onChange={(e) => setFeatures({ ...features, reservations: e.target.checked })}
            />
            <span>Enable Reservations</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.shifts}
              onChange={(e) => setFeatures({ ...features, shifts: e.target.checked })}
            />
            <span>Enable Shifts (cash reconciliation)</span>
          </label>
        </div>
        )}

        {activeSection === 'online' && (
        <div className="card settings-form">
          <h2>Online Ordering</h2>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={features.onlineOrdering}
              onChange={(e) => setFeatures({ ...features, onlineOrdering: e.target.checked })}
            />
            <span>Enable QR ordering</span>
          </label>
          <p className="page-subtitle">
            Guests scan a table QR to order; items arrive as unfired lines for staff to fire.
          </p>
        </div>
        )}

        {activeSection === 'online' && (
          <DeliveryPartnersCard delivery={delivery} onUpdate={updateDeliveryField} />
        )}

        {activeSection === 'loyalty' && features.loyalty && (
          <div className="card settings-form">
            <h2>Loyalty</h2>
            <div className="field-row">
              <label className="field">
                <span>Points per ₹100 spent</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={loyalty.pointsPer100}
                  onChange={(e) => setLoyalty({ ...loyalty, pointsPer100: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Point value (₹ per point)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={loyalty.pointValue}
                  onChange={(e) => setLoyalty({ ...loyalty, pointValue: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Referral bonus (pts)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={loyalty.referralBonus}
                  onChange={(e) => setLoyalty({ ...loyalty, referralBonus: e.target.value })}
                />
              </label>
            </div>

            <span className="field-label">Tiers</span>
            {loyalty.tiers.map((t, idx) => (
              <div className="preset-row" key={idx}>
                <input
                  className="preset-row-label"
                  placeholder="Tier name"
                  value={t.name}
                  onChange={(e) => updateTier(idx, 'name', e.target.value)}
                />
                <input
                  className="preset-row-value"
                  type="number"
                  min="0"
                  placeholder="Min points"
                  value={t.minPoints}
                  onChange={(e) => updateTier(idx, 'minPoints', e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger-text"
                  onClick={() => removeTier(idx)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addTier}>
              + Add tier
            </button>
          </div>
        )}

        {activeSection === 'printing' && (
        <div className="card settings-form printing-card">
          <h2>Printing</h2>
          <p className="page-subtitle">
            Network printing requires an ESC/POS printer reachable from the SERVER, not this
            device.
          </p>

          {[
            { key: 'kot', label: 'KOT Printer' },
            { key: 'receipt', label: 'Receipt Printer' },
          ].map(({ key, label }) => (
            <div key={key} className="print-target-block">
              <span className="field-label">{label}</span>
              <div className="field-row">
                <label className="field">
                  <span>Provider</span>
                  <select
                    value={printing[key].provider}
                    onChange={(e) => updatePrintTarget(key, 'provider', e.target.value)}
                  >
                    <option value="BROWSER">Browser</option>
                    <option value="ESCPOS_NETWORK">Network ESC-POS</option>
                  </select>
                </label>
                {printing[key].provider === 'ESCPOS_NETWORK' && (
                  <>
                    <label className="field">
                      <span>Host</span>
                      <input
                        placeholder="192.168.1.50"
                        value={printing[key].host}
                        onChange={(e) => updatePrintTarget(key, 'host', e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Port</span>
                      <input
                        type="number"
                        placeholder="9100"
                        value={printing[key].port}
                        onChange={(e) => updatePrintTarget(key, 'port', e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={testPrintMutation.isPending}
                onClick={() => testPrintMutation.mutate(key === 'kot' ? 'kot' : 'receipt')}
              >
                {testPrintMutation.isPending ? 'Testing…' : 'Test print'}
              </button>
            </div>
          ))}
        </div>
        )}

        {SHARED_FORM_SECTIONS.has(activeSection) && (
          <div className="settings-savebar">
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        )}
      </form>

      {browserTestPayload && (
        <div className="printable-area">
          <pre className="kot-print-raw">
            {typeof browserTestPayload === 'string'
              ? browserTestPayload
              : JSON.stringify(browserTestPayload, null, 2)}
          </pre>
        </div>
      )}

      {activeSection === 'features' && (
        <ApprovalsCard
          pin={pin}
          pinConfirm={pinConfirm}
          setPin={setPin}
          setPinConfirm={setPinConfirm}
          onSubmit={handlePinSubmit}
          isSubmitting={pinMutation.isPending}
          maxPercent={discounts.maxPercent}
        />
      )}

      {activeSection === 'general' && <AccountCard />}

      {activeSection === 'invoiceTemplate' && <InvoiceTemplateDesigner />}

      {activeSection === 'branches' && <BranchesCard />}
        </div>
      </div>
    </div>
  )
}

// Own-account self-service — available to ANY authenticated user (not gated
// by settings.manage), since it only ever touches the caller's own account.
function AccountCard() {
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [isExporting, setIsExporting] = useState(false)

  const closePasswordModal = () => {
    setPasswordModalOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setNewPasswordConfirm('')
  }

  const passwordMutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast('Password changed', 'success')
      closePasswordModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to change password', 'error'),
  })

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast('New password must be at least 8 characters', 'error')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      toast('New passwords do not match', 'error')
      return
    }
    passwordMutation.mutate()
  }

  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setDeleteConfirmText('')
  }

  // TODO: backend not implemented yet — this is a dummy confirmation UI only.
  const handleDeleteAccount = () => {
    toast('Account deletion is not implemented yet', 'info')
    closeDeleteModal()
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const response = await api.get('/settings/export', { responseType: 'blob' })
      const disposition = response.headers['content-disposition'] || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : 'export.json'

      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast('Export downloaded', 'success')
    } catch (e) {
      toast(e.response?.data?.message || 'Failed to export data', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className='card'>
      <h2 className="settings-group-title">Account</h2>

      <div className="">
        <div className="settings-subsection settings-row-panel">
          <div>
            <h3>Password</h3>
            <p className="page-subtitle">Update the password used to log in.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setPasswordModalOpen(true)}>
            Change Password
          </button>
        </div>

        {hasPermission('settings.manage') && (
          <div className="settings-subsection settings-row-panel">
            <div>
              <h3>Data Export</h3>
              <p className="page-subtitle">
                Download a JSON snapshot of your restaurant's data — settings, menu, customers, and
                the last 90 days of invoices.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting…' : 'Export my data'}
            </button>
          </div>
        )}

        <div className="settings-subsection settings-row-panel">
          <div>
            <h3>Delete Account</h3>
            <p className="page-subtitle">
              Permanently delete your restaurant account and all of its data. This action cannot be undone.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete Account
          </button>
        </div>
      </div>


      <Modal open={passwordModalOpen} onClose={closePasswordModal} title="Change Password">
        <form onSubmit={handlePasswordSubmit}>
          <label className="field">
            <span>Current Password</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>New Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Confirm New Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closePasswordModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteModalOpen} onClose={closeDeleteModal} title="Delete Account">
        <div className="banner banner-danger">
          <span>
            Warning: this permanently deletes your restaurant account and everything in it — menu,
            orders, invoices, customers, staff, and settings. There is no way to undo this.
          </span>
        </div>
        <label className="field">
          <span>
            Type <strong>DELETE</strong> to confirm
          </span>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={closeDeleteModal}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleteConfirmText !== 'DELETE'}
            onClick={handleDeleteAccount}
          >
            Delete Account
          </button>
        </div>
      </Modal>
    </div>
  )
}

const DELIVERY_PARTNERS = [
  { key: 'zomato', label: 'Zomato' },
  { key: 'swiggy', label: 'Swiggy' },
]

function DeliveryPartnersCard({ delivery, onUpdate }) {
  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Webhook URL copied', 'success')
    } catch {
      toast('Could not copy URL', 'error')
    }
  }

  return (
    <div className="card settings-form">
      <h2>Delivery Partners</h2>
      <p className="page-subtitle">
        Connect delivery aggregators — orders arrive automatically via their webhook.
      </p>
      {DELIVERY_PARTNERS.map(({ key, label }) => {
        const webhookUrl = `${window.location.origin}/api/delivery/webhook/${key}`
        return (
          <div key={key} className="provider-config-body delivery-partner-row">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={!!delivery[key]?.enabled}
                onChange={(e) => onUpdate(key, 'enabled', e.target.checked)}
              />
              <span>{label}</span>
            </label>
            <div className="field-row">
              <label className="field">
                <span>Webhook Secret</span>
                <input
                  type="password"
                  value={delivery[key]?.secret || ''}
                  onChange={(e) => onUpdate(key, 'secret', e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Webhook URL</span>
              <div className="webhook-url-row">
                <input readOnly value={webhookUrl} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleCopy(webhookUrl)}>
                  Copy
                </button>
              </div>
            </label>
          </div>
        )
      })}
    </div>
  )
}

function ApprovalsCard({ pin, pinConfirm, setPin, setPinConfirm, onSubmit, isSubmitting, maxPercent }) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  if (!hasPermission('settings.manage')) return null

  return (
    <div className="card settings-form">
      <h2>Approvals</h2>
      <p className="page-subtitle">
        Set a manager PIN. Discounts above {maxPercent || 0}% require this PIN to authorize at
        checkout.
      </p>
      <form onSubmit={onSubmit}>
        <div className="field-row">
          <label className="field">
            <span>New Manager PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={!pin || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save PIN'}
          </button>
        </div>
      </form>
    </div>
  )
}

const emptyBranchForm = {
  code: '',
  name: '',
  address: '',
  phone: '',
  active: true,
  serviceMode: 'TABLE_SERVICE',
}

// Multi-branch operation is out of scope for Phase 5 — this card only lets
// Admins pre-register branch records for a later phase. All data (menu,
// inventory, invoices, etc.) still lives in a single implicit "main" branch.
function BranchesCard() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyBranchForm)

  const canManageBranches = hasPermission('branches.manage')

  const { data, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
    enabled: canManageBranches,
  })
  const branches = Array.isArray(data) ? data : data?.items || []

  // Phase 6.5 — per-user branch locking toggle. Shares the ['settings']
  // query cache with the rest of this page.
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: canManageBranches,
  })
  const staffCanSwitchBranches = !!settingsData?.branchAccess?.staffCanSwitchBranches

  const branchAccessMutation = useMutation({
    mutationFn: (staffCanSwitchBranches) => updateSettings({ branchAccess: { staffCanSwitchBranches } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast('Branch access setting updated', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update branch access setting', 'error'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['branches'] })

  const createMutation = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      invalidate()
      toast('Branch created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create branch', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => updateBranch(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Branch updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update branch', 'error'),
  })

  if (!canManageBranches) return null

  const openCreate = () => {
    setEditing(null)
    setForm(emptyBranchForm)
    setModalOpen(true)
  }

  const openEdit = (branch) => {
    setEditing(branch)
    setForm({
      code: branch.code || '',
      name: branch.name || '',
      address: branch.address || '',
      phone: branch.phone || '',
      active: branch.active ?? true,
      serviceMode: branch.serviceMode || 'TABLE_SERVICE',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyBranchForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div className="card settings-form">
      <div className="page-header">
        <h2>Branches</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openCreate}>
          + Add Branch
        </button>
      </div>
      <p className="page-subtitle">
        Multi-branch operation — coming in a later phase; all data currently lives in the main
        branch.
      </p>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={staffCanSwitchBranches}
          onChange={(e) => branchAccessMutation.mutate(e.target.checked)}
          disabled={branchAccessMutation.isPending}
        />
        <span>Allow staff to switch between branches</span>
      </label>
      <p className="page-subtitle">
        When off, each staff member can only work in the branch they&apos;re assigned to in Users.
      </p>

      {isLoading ? (
        <Spinner label="Loading branches…" />
      ) : branches.length === 0 ? (
        <EmptyState title="No branches yet" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Service Mode</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b._id || b.id}>
                <td>{b.code}</td>
                <td>{b.name}</td>
                <td>{b.phone || '—'}</td>
                <td>{b.serviceMode === 'QSR' ? 'QSR' : 'Table Service'}</td>
                <td>
                  <span className={`badge ${b.active === false ? 'badge-muted' : 'badge-success'}`}>
                    {b.active === false ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td className="table-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(b)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit Branch' : 'New Branch'}
        width="440px"
      >
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>Code</span>
              <input
                required
                autoFocus
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Address</span>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Service Mode</span>
            <select
              value={form.serviceMode}
              onChange={(e) => setForm({ ...form, serviceMode: e.target.value })}
            >
              <option value="TABLE_SERVICE">Table Service (print bill, then pay)</option>
              <option value="QSR">QSR (pay, then print receipt)</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>Active</span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
