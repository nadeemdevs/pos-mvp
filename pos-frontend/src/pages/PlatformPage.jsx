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

export default function PlatformPage() {
  const queryClient = useQueryClient()
  // The tenant we're about to flip; holds { slug, name, nextStatus }.
  const [target, setTarget] = useState(null)

  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: getPlatformOverview,
    retry: false,
  })

  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: getPlatformTenants,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform</h1>
          <p className="page-subtitle">Tenant operations across the platform</p>
        </div>
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
            <span className="stat-label">Revenue (30d)</span>
            <span className="stat-value">{formatCurrency(overview?.revenue30d)}</span>
          </div>
        </div>
      )}

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
                <th>Revenue (30d)</th>
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
                    <td>{formatCurrency(t.revenue30d)}</td>
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
