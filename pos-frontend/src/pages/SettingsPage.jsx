import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings } from '../services/settingsService'
import { testPrint } from '../services/printService'
import { createBranch, getBranches, updateBranch } from '../services/branchService'
import { useAuthStore } from '../store/authStore'
import { toast } from '../store/toastStore'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'

const emptyForm = {
  restaurantName: '',
  address: '',
  phone: '',
  taxRate: '',
  currency: 'INR',
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
const emptyFeatures = { dineIn: false, inventory: false, crm: false, loyalty: false, analytics: false }
const emptyPrintTarget = { provider: 'BROWSER', host: '', port: '' }
const emptyPrinting = { kot: { ...emptyPrintTarget }, receipt: { ...emptyPrintTarget } }

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [paymentProviders, setPaymentProviders] = useState(emptyPaymentProviders)
  const [discounts, setDiscounts] = useState(emptyDiscounts)
  const [rounding, setRounding] = useState(emptyRounding)
  const [features, setFeatures] = useState(emptyFeatures)
  const [printing, setPrinting] = useState(emptyPrinting)
  const [browserTestPayload, setBrowserTestPayload] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  useEffect(() => {
    if (data) {
      setForm({
        restaurantName: data.restaurantName || '',
        address: data.address || '',
        phone: data.phone || '',
        taxRate: data.taxRate ?? '',
        currency: data.currency || 'INR',
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
      })
      setPrinting({
        kot: { ...emptyPrintTarget, ...data.printing?.kot },
        receipt: { ...emptyPrintTarget, ...data.printing?.receipt },
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
    })
  }

  if (isLoading) return <Spinner label="Loading settings…" />

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Restaurant profile and defaults</p>

      <form onSubmit={handleSubmit}>
        <div className="card settings-form">
          <label className="field">
            <span>Restaurant Name</span>
            <input
              value={form.restaurantName}
              onChange={(e) => setForm({ ...form, restaurantName: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Address</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
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
          <label className="field">
            <span>Receipt Footer</span>
            <textarea
              rows={3}
              value={form.receiptFooter}
              onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
            />
          </label>
        </div>

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
        </div>

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

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
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

      <BranchesCard />
    </div>
  )
}

const emptyBranchForm = { code: '', name: '', address: '', phone: '', active: true }

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
