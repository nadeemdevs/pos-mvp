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

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)

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

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({ ...form, taxRate: Number(form.taxRate) || 0 })
  }

  if (isLoading) return <Spinner label="Loading settings…" />

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Restaurant profile and defaults</p>

      <form className="card settings-form" onSubmit={handleSubmit}>
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
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
