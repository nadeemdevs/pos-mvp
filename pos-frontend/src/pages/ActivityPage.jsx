import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPlatformAuditLogs } from '../services/platformService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { formatDateTime } from '../utils/format'

const PAGE_SIZE = 25

// Phase 6.4b — platform-level activity log. Mirrors AuditPage.jsx's UX
// exactly, against the separate PLATFORM audit collection (operator logins,
// tenant suspend/activate, settings changes, feature overrides) rather than
// the tenant-scoped one.
function truncateMeta(meta) {
  if (meta == null) return '—'
  let text = ''
  try {
    text = typeof meta === 'string' ? meta : JSON.stringify(meta)
  } catch {
    return '—'
  }
  if (!text) return '—'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export default function ActivityPage() {
  const [actionInput, setActionInput] = useState('')
  const [entityInput, setEntityInput] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const action = useDebouncedValue(actionInput, 300)
  const entity = useDebouncedValue(entityInput, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['platform', 'audit', { action, entity, from, to, page }],
    queryFn: () =>
      getPlatformAuditLogs({
        ...(action ? { action } : {}),
        ...(entity ? { entity } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        page,
        limit: PAGE_SIZE,
      }),
  })

  const entries = data?.items || []
  const total = data?.total ?? entries.length
  const hasMore = page * PAGE_SIZE < total

  const updateFilter = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Platform-operator activity across all tenants</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Filter by action…"
          value={actionInput}
          onChange={(e) => updateFilter(setActionInput)(e.target.value)}
        />
        <input
          placeholder="Filter by entity…"
          value={entityInput}
          onChange={(e) => updateFilter(setEntityInput)(e.target.value)}
        />
        <input type="date" value={from} onChange={(e) => updateFilter(setFrom)(e.target.value)} />
        <input type="date" value={to} onChange={(e) => updateFilter(setTo)(e.target.value)} />
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading activity…" />
        ) : entries.length === 0 ? (
          <EmptyState title="No activity found" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr key={entry._id || idx}>
                    <td>{formatDateTime(entry.at)}</td>
                    <td>{entry.operatorEmail || '—'}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.entity}
                      {entry.entityId ? ` #${String(entry.entityId).slice(-6)}` : ''}
                    </td>
                    <td title={typeof entry.meta === 'string' ? entry.meta : JSON.stringify(entry.meta)}>
                      {truncateMeta(entry.meta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination-row">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pagination-label">Page {page}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
