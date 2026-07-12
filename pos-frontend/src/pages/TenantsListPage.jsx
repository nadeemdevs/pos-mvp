import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPlatformTenants, setTenantStatus } from '../services/platformService'
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

// Phase 6.4b — the full tenant management table, moved off the Overview page
// onto its own route. Search is client-side (name/slug/owner email) — fine
// at the expected tenant-count scale; the server already returns the whole
// registry in one call (see platform.controller.js#listTenants).
export default function TenantsListPage() {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState(null)
  const [range, setRange] = useState('30d')
  const [sort, setSort] = useState('created')
  const [search, setSearch] = useState('')

  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', range, sort],
    queryFn: () => getPlatformTenants(range, sort),
    retry: false,
  })

  const tenants = Array.isArray(tenantsQuery.data)
    ? tenantsQuery.data
    : tenantsQuery.data?.items || []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.ownerEmail?.toLowerCase().includes(q),
    )
  }, [tenants, search])

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
      toast(e.response?.data?.message || 'Failed to update tenant', 'error')
      setTarget(null)
    },
  })

  const toggleGmvSort = () => setSort((s) => (s === 'gmv' ? 'created' : 'gmv'))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">Search, review, and suspend/activate tenants</p>
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

      <div className="toolbar">
        <input
          placeholder="Search by name, slug, or owner email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {tenantsQuery.isLoading ? (
          <Spinner label="Loading tenants…" />
        ) : tenantsQuery.isError ? (
          <EmptyState title="Couldn't load tenants" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No tenants match" />
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
              {filtered.map((t) => {
                const isDefault = t.slug === 'default'
                const suspended = t.status === 'SUSPENDED'
                return (
                  <tr key={t.slug}>
                    <td>
                      <Link to={`/platform/tenants/${t.slug}`}>
                        <div>{t.name}</div>
                        <div className="platform-tenant-slug">{t.slug}</div>
                      </Link>
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
