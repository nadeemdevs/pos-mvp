import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlatformSettings, updatePlatformSettings } from '../services/platformService'
import { toast } from '../store/toastStore'
import Spinner from '../components/Spinner'

const PROVIDER_OPTIONS = [
  { code: 'RESEND', label: 'Resend', implemented: true },
  { code: 'SENDGRID', label: 'SendGrid', implemented: false },
  { code: 'POSTMARK', label: 'Postmark', implemented: false },
]

const emptyEmailProvider = { provider: 'RESEND', fromAddress: '', apiKey: '' }
const emptyPlatform = { defaultTrialDays: '', supportEmail: '', maintenanceMode: false }

export default function PlatformSettingsPage() {
  const queryClient = useQueryClient()
  const [emailProvider, setEmailProvider] = useState(emptyEmailProvider)
  const [apiKeyPreview, setApiKeyPreview] = useState(null)
  const [platform, setPlatform] = useState(emptyPlatform)

  const { data, isLoading } = useQuery({ queryKey: ['platform', 'settings'], queryFn: getPlatformSettings })

  useEffect(() => {
    if (data) {
      setEmailProvider({
        provider: data.emailProvider?.provider || 'RESEND',
        fromAddress: data.emailProvider?.fromAddress || '',
        // apiKey input always starts blank — a blank/omitted value on save
        // means "keep the existing key" (see backend PUT handler).
        apiKey: '',
      })
      setApiKeyPreview(data.emailProvider?.apiKeyPreview || null)
      setPlatform({
        defaultTrialDays: data.defaultTrialDays ?? '',
        supportEmail: data.supportEmail || '',
        maintenanceMode: data.maintenanceMode === true,
      })
    }
  }, [data])

  const mutation = useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: (result) => {
      queryClient.setQueryData(['platform', 'settings'], result)
      setEmailProvider((prev) => ({ ...prev, apiKey: '' }))
      setApiKeyPreview(result.emailProvider?.apiKeyPreview || null)
      toast('Platform settings saved', 'success')
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to save settings', 'error')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({
      emailProvider: {
        provider: emailProvider.provider,
        fromAddress: emailProvider.fromAddress,
        // Blank apiKey means "keep existing" — omit it entirely rather than
        // sending an empty string, so the backend's "keep existing" branch
        // is unambiguous either way.
        ...(emailProvider.apiKey ? { apiKey: emailProvider.apiKey } : {}),
      },
      defaultTrialDays: platform.defaultTrialDays === '' ? undefined : Number(platform.defaultTrialDays),
      supportEmail: platform.supportEmail,
      maintenanceMode: platform.maintenanceMode,
    })
  }

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.code === emailProvider.provider)

  if (isLoading) {
    return <Spinner label="Loading platform settings…" />
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Settings</h1>
          <p className="page-subtitle">Email delivery and platform-wide defaults</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card settings-form">
          <h2>Email Provider</h2>
          <label className="field">
            <span>Provider</span>
            <select
              value={emailProvider.provider}
              onChange={(e) => setEmailProvider({ ...emailProvider, provider: e.target.value })}
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {selectedProvider && !selectedProvider.implemented && (
            <p className="banner banner-warning">
              {selectedProvider.label} isn't wired up on the backend yet — you can save the
              intent, but sends will keep using whatever provider was actually configured until
              it's implemented.
            </p>
          )}
          <label className="field">
            <span>API Key {apiKeyPreview ? `(current: ${apiKeyPreview})` : '(not set)'}</span>
            <input
              type="password"
              placeholder={apiKeyPreview ? 'Leave blank to keep current key' : 'Enter API key'}
              value={emailProvider.apiKey}
              onChange={(e) => setEmailProvider({ ...emailProvider, apiKey: e.target.value })}
            />
          </label>
          <label className="field">
            <span>From Address</span>
            <input
              type="email"
              value={emailProvider.fromAddress}
              onChange={(e) => setEmailProvider({ ...emailProvider, fromAddress: e.target.value })}
            />
          </label>
        </div>

        <div className="card settings-form">
          <h2>Platform</h2>
          <label className="field">
            <span>Default Trial Days</span>
            <input
              type="number"
              min="0"
              value={platform.defaultTrialDays}
              onChange={(e) => setPlatform({ ...platform, defaultTrialDays: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Support Email</span>
            <input
              type="email"
              value={platform.supportEmail}
              onChange={(e) => setPlatform({ ...platform, supportEmail: e.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={platform.maintenanceMode}
              onChange={(e) => setPlatform({ ...platform, maintenanceMode: e.target.checked })}
            />
            <span>Maintenance mode</span>
          </label>
          <p className="page-subtitle">
            When on, tenant login and signup are blocked with a 503 until this is switched back
            off. Platform operators are never affected by this flag.
          </p>
        </div>

        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
