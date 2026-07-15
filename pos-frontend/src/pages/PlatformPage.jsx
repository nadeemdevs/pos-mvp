import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPlatformOverview, getPlatformTenants } from '../services/platformService'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { formatCurrency } from '../utils/format'

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All-time' },
]

// Phase 6.4b — Overview restyled Stripe-style: one big GMV headline + trend
// chart first, supporting stat cards below, then a compact top-5 GMV
// leaderboard. The FULL tenant management table now lives on its own route
// (/platform/tenants, see TenantsListPage.jsx) — this page is a dashboard,
// not the management surface.
export default function PlatformPage() {
  const [range, setRange] = useState('30d')

  const overviewQuery = useQuery({
    queryKey: ['platform', 'overview', range],
    queryFn: () => getPlatformOverview(range),
    retry: false,
  })

  const leaderboardQuery = useQuery({
    queryKey: ['platform', 'tenants', range, 'gmv'],
    queryFn: () => getPlatformTenants(range, 'gmv'),
    retry: false,
  })

  const overview = overviewQuery.data
  const tenants = Array.isArray(leaderboardQuery.data)
    ? leaderboardQuery.data
    : leaderboardQuery.data?.items || []
  const top5 = tenants.slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Platform-wide activity at a glance</p>
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

      <div className="platform-hero">
        <span className="platform-hero-label">Transaction Volume (GMV)</span>
        {overviewQuery.isLoading ? (
          <Spinner label="Loading…" />
        ) : (
          <div className="platform-hero-value">{formatCurrency(overview?.gmv)}</div>
        )}
        <GmvTrendChart data={overview?.gmvTrend} loading={overviewQuery.isLoading} />
      </div>

      {overviewQuery.isError ? (
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
        </div>
      )}

      <div className="card">
        <h2>Top tenants by GMV</h2>
        {leaderboardQuery.isLoading ? (
          <Spinner label="Loading leaderboard…" />
        ) : top5.length === 0 ? (
          <EmptyState title="No transaction volume in this range" />
        ) : (
          <>
            {top5.map((t, idx) => (
              <Link key={t.slug} to={`/platform/tenants/${t.slug}`} className="platform-leaderboard-row">
                <span className="platform-leaderboard-rank">#{idx + 1}</span>
                <span className="platform-leaderboard-name">{t.name}</span>
                <span className="platform-leaderboard-gmv">{formatCurrency(t.gmv)}</span>
              </Link>
            ))}
            <Link to="/platform/tenants" className="platform-view-all-link">
              View all tenants →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function GmvTrendChart({ data, loading }) {
  const rows = Array.isArray(data) ? data : []
  const maxGmv = Math.max(1, ...rows.map((r) => r.gmv || 0))

  if (loading) return <Spinner label="Loading trend…" />
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
