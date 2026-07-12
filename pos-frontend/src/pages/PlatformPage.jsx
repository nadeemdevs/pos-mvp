import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getPlatformOverview,
  getPlatformTenants,
  setTenantStatus,
} from '../services/platformService'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDate } from '../utils/format'

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All-time' },
]

export default function PlatformPage() {
  const queryClient = useQueryClient()
  // The tenant we're about to flip; holds { slug, name, nextStatus }.
  const [target, setTarget] = useState(null)
  const [range, setRange] = useState('30d')
  const [sort, setSort] = useState('created')

  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview', range],
    queryFn: () => getPlatformOverview(range),
    retry: false,
  })

  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', range, sort],
    queryFn: () => getPlatformTenants(range, sort),
    retry: false,
  })

  const tenants = Array.isArray(tenantsQuery.data)
    ? tenantsQuery.data
    : tenantsQuery.data?.items || []

  const statusMutation = useMutation({
    mutationFn: ({ slug, status }) => setTenantStatus(slug, status),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] })
      queryClient.invalidateQueries({ queryKey: ['platform', 'overview'] })
      toast(
        vars.status === 'SUSPENDED' ? 'Tenant suspended' : 'Tenant activated',
        'success',
      )
      setTarget(null)
    },
    onError: (e) => {
      // Surface backend guardrails verbatim (e.g. refusing to suspend the
      // primary 'default' tenant).
      toast(e.response?.data?.message || 'Failed to update tenant', 'error')
      setTarget(null)
    },
  })

  const overview = overviewQuery.data

  const toggleGmvSort = () => setSort((s) => (s === 'gmv' ? 'created' : 'gmv'))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform</h1>
          <p className="page-subtitle">Tenant operations across the platform</p>
        </div>
        <div className="chip-row">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`chip ${range === r.key ? 'active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="banner banner-warning">
        Platform subscription billing isn't live yet — the figures below reflect gross sales
        (GMV) processed through tenant restaurants, not platform revenue.
      </div>

      {/* Overview stat cards */}
      {overviewQuery.isLoading ? (
        <Spinner label="Loading overview…" />
      ) : overviewQuery.isError ? (
        <div className="card">
          <EmptyState title="Couldn't load overview" />
        </div>
      ) : (
        <div className="stat-cards">
          <div className="stat-card">
            <span className="stat-label">Tenants</span>
            <span className="stat-value">{overview?.tenantCount ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active</span>
            <span className="stat-value">{overview?.active ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Suspended</span>
            <span className="stat-value">{overview?.suspended ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Signups this month</span>
            <span className="stat-value">{overview?.signupsThisMonth ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Transaction Volume (GMV)</span>
            <span className="stat-value">{formatCurrency(overview?.gmv)}</span>
          </div>
        </div>
      )}

      <GmvTrendCard data={overview?.gmvTrend} loading={overviewQuery.isLoading} />

      {/* Tenants table */}
      <div className="card">
        {tenantsQuery.isLoading ? (
          <Spinner label="Loading tenants…" />
        ) : tenantsQuery.isError ? (
          <EmptyState title="Couldn't load tenants" />
        ) : tenants.length === 0 ? (
          <EmptyState title="No tenants yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Owner</th>
                <th>Created</th>
                <th>Users</th>
                <th>Invoices</th>
                <th className="sortable-th" onClick={toggleGmvSort}>
                  GMV{sort === 'gmv' ? ' ▼' : ''}
                </th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isDefault = t.slug === 'default'
                const suspended = t.status === 'SUSPENDED'
                return (
                  <tr key={t.slug}>
                    <td>
                      <div>{t.name}</div>
                      <div className="platform-tenant-slug">{t.slug}</div>
                    </td>
                    <td>{t.ownerEmail || '—'}</td>
                    <td>{t.createdAt ? formatDate(t.createdAt) : '—'}</td>
                    <td>{t.userCount ?? 0}</td>
                    <td>{t.invoiceCount ?? 0}</td>
                    <td>{formatCurrency(t.gmv)}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          suspended ? 'status-pill-failed' : 'status-pill-success'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="table-actions">
                      {suspended ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            setTarget({ slug: t.slug, name: t.name, nextStatus: 'ACTIVE' })
                          }
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm btn-danger-text"
                          disabled={isDefault || statusMutation.isPending}
                          title={isDefault ? 'Primary tenant' : undefined}
                          onClick={() =>
                            setTarget({ slug: t.slug, name: t.name, nextStatus: 'SUSPENDED' })
                          }
                        >
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        title={target?.nextStatus === 'SUSPENDED' ? 'Suspend tenant' : 'Activate tenant'}
        message={
          target?.nextStatus === 'SUSPENDED'
            ? `Suspend ${target?.name}? Their staff will be logged out and unable to use the system until reactivated.`
            : `Activate ${target?.name}? Their staff will be able to use the system again.`
        }
        confirmLabel={target?.nextStatus === 'SUSPENDED' ? 'Suspend' : 'Activate'}
        danger={target?.nextStatus === 'SUSPENDED'}
        onCancel={() => setTarget(null)}
        onConfirm={() =>
          statusMutation.mutate({ slug: target.slug, status: target.nextStatus })
        }
      />
    </div>
  )
}

function GmvTrendCard({ data, loading }) {
  const rows = Array.isArray(data) ? data : []
  const maxGmv = Math.max(1, ...rows.map((r) => r.gmv || 0))

  return (
    <div className="card">
      <h2>GMV Trend</h2>
      {loading ? (
        <Spinner label="Loading trend…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No transaction volume in this range" />
      ) : (
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
      )}
    </div>
  )
}
