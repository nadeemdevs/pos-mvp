import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPlatformTenantDetail,
  setTenantStatus,
  updateTenantFeatures,
} from '../services/platformService'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDate } from '../utils/format'

// Known feature flags (see backend setting.model.js#featuresSchema — the
// authoritative source of truth for this list). Kept as a plain label map
// here rather than re-deriving it from the API response, so a flag that's
// missing from an older tenant's settings doc still renders (as OFF) instead
// of silently disappearing from the toggle list.
const FEATURE_LABELS = {
  dineIn: 'Dine-in (tables/orders/kitchen UI)',
  inventory: 'Inventory & purchasing',
  crm: 'CRM (customers)',
  loyalty: 'Loyalty program',
  analytics: 'Analytics',
  reservations: 'Reservations',
  shifts: 'Shifts',
  onlineOrdering: 'Online ordering (QR)',
}
const FEATURE_KEYS = Object.keys(FEATURE_LABELS)

export default function TenantDetailPage() {
  const { slug } = useParams()
  const queryClient = useQueryClient()
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [features, setFeatures] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform', 'tenant', slug],
    queryFn: () => getPlatformTenantDetail(slug),
    retry: false,
  })

  useEffect(() => {
    if (data?.features) {
      setFeatures(data.features)
    }
  }, [data])

  const statusMutation = useMutation({
    mutationFn: (status) => setTenantStatus(slug, status),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', slug] })
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] })
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] })
      toast(status === 'SUSPENDED' ? 'Tenant suspended' : 'Tenant activated', 'success')
      setConfirmTarget(null)
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to update tenant', 'error')
      setConfirmTarget(null)
    },
  })

  const featuresMutation = useMutation({
    mutationFn: () => updateTenantFeatures(slug, features),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenant', slug] })
      setFeatures(result.features)
      toast('Feature flags saved', 'success')
    },
    onError: (e) => {
      toast(e.response?.data?.message || 'Failed to save feature flags', 'error')
    },
  })

  if (isLoading) return <Spinner label="Loading tenant…" />
  if (isError || !data) {
    return (
      <div className="card">
        <EmptyState title="Couldn't load this tenant" />
      </div>
    )
  }

  const { tenant, stats, users, branches } = data
  const isDefault = tenant.slug === 'default'
  const suspended = tenant.status === 'SUSPENDED'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p className="page-subtitle">
            {tenant.slug} · {tenant.ownerEmail || 'no owner email'} · Created{' '}
            {tenant.createdAt ? formatDate(tenant.createdAt) : '—'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`status-pill ${suspended ? 'status-pill-failed' : 'status-pill-success'}`}>
            {tenant.status}
          </span>
          {suspended ? (
            <button
              className="btn btn-ghost btn-sm"
              disabled={statusMutation.isPending}
              onClick={() => setConfirmTarget('ACTIVE')}
            >
              Activate
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm btn-danger-text"
              disabled={isDefault || statusMutation.isPending}
              title={isDefault ? 'Primary tenant' : undefined}
              onClick={() => setConfirmTarget('SUSPENDED')}
            >
              Suspend
            </button>
          )}
        </div>
      </div>

      <p style={{ marginTop: -12, marginBottom: 20 }}>
        <Link to="/platform/tenants" className="platform-view-all-link">
          ← Back to all tenants
        </Link>
      </p>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Users</span>
          <span className="stat-value">{stats.userCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Invoices</span>
          <span className="stat-value">{stats.invoiceCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">GMV (30d)</span>
          <span className="stat-value">{formatCurrency(stats.gmv30d)}</span>
        </div>
      </div>

      <div className="card">
        <h2>GMV Trend</h2>
        <GmvTrendChart data={stats.gmvTrend} />
      </div>

      <div className="card">
        <h2>Users</h2>
        {users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Branches</h2>
        {branches.length === 0 ? (
          <EmptyState title="No branches" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.code}>
                  <td>{b.code}</td>
                  <td>{b.name}</td>
                  <td>
                    <span className={`status-pill ${b.active ? 'status-pill-success' : 'status-pill-failed'}`}>
                      {b.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Feature Flags</h2>
        <p className="page-subtitle">
          Overrides this tenant's UI-facing feature gates. Backend APIs stay available
          regardless of these flags — see setting.model.js.
        </p>
        {features === null ? (
          <Spinner label="Loading features…" />
        ) : (
          <>
            {FEATURE_KEYS.map((key) => (
              <div key={key} className="platform-feature-row">
                <span className="platform-feature-name">{FEATURE_LABELS[key]}</span>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={!!features[key]}
                    onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
                  />
                  <span>{features[key] ? 'On' : 'Off'}</span>
                </label>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              disabled={featuresMutation.isPending}
              onClick={() => featuresMutation.mutate()}
            >
              {featuresMutation.isPending ? 'Saving…' : 'Save Feature Flags'}
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmTarget}
        title={confirmTarget === 'SUSPENDED' ? 'Suspend tenant' : 'Activate tenant'}
        message={
          confirmTarget === 'SUSPENDED'
            ? `Suspend ${tenant.name}? Their staff will be logged out and unable to use the system until reactivated.`
            : `Activate ${tenant.name}? Their staff will be able to use the system again.`
        }
        confirmLabel={confirmTarget === 'SUSPENDED' ? 'Suspend' : 'Activate'}
        danger={confirmTarget === 'SUSPENDED'}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => statusMutation.mutate(confirmTarget)}
      />
    </div>
  )
}

function GmvTrendChart({ data }) {
  const rows = Array.isArray(data) ? data : []
  const maxGmv = Math.max(1, ...rows.map((r) => r.gmv || 0))

  if (rows.length === 0) return <EmptyState title="No transaction volume in this range" />

  return (
    <div className="peak-hours-chart">
      {rows.map((r, idx) => (
        <div key={r.date} className="peak-hours-bar-wrap">
          <div
            className="peak-hours-bar"
            title={`${r.date}: ${formatCurrency(r.gmv)}`}
            style={{ height: `${Math.max(2, (r.gmv / maxGmv) * 100)}%` }}
          />
          <span className="peak-hours-label">
            {idx % Math.ceil(rows.length / 10 || 1) === 0 ? r.date.slice(5) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
