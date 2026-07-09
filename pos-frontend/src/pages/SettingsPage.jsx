import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings } from '../services/settingsService'
import { toast } from '../store/toastStore'
import Spinner from '../components/Spinner'

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

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [paymentProviders, setPaymentProviders] = useState(emptyPaymentProviders)

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
    }
  }, [data])

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

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({
      ...form,
      taxRate: Number(form.taxRate) || 0,
      // Spread whatever the server currently has for paymentProviders first,
      // then layer the edited section on top, so we never clobber fields
      // this form doesn't know about (or other unrelated settings keys).
      paymentProviders: {
        ...(data?.paymentProviders || {}),
        ...paymentProviders,
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

        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
