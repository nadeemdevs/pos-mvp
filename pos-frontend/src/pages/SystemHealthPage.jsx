import { useQuery } from '@tanstack/react-query'
import { getPlatformHealth } from '../services/platformService'
import Spinner from '../components/Spinner'
import { formatDateTime } from '../utils/format'

// Phase 6.4b — quick operational snapshot for platform operators: DB
// reachability/latency, email provider config + last send-attempt outcome,
// process uptime. Auto-refreshes every 30s; manual refresh button too.
export default function SystemHealthPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['platform', 'health'],
    queryFn: getPlatformHealth,
    refetchInterval: 30_000,
    retry: false,
  })

  if (isLoading) return <Spinner label="Loading system health…" />

  const db = data?.db
  const email = data?.email

  const hours = Math.floor((data?.uptimeSeconds || 0) / 3600)
  const minutes = Math.floor(((data?.uptimeSeconds || 0) % 3600) / 60)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System</h1>
          <p className="page-subtitle">Backend health and connectivity</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Database</span>
          <span className="stat-value">
            <span
              className={`platform-health-dot ${db?.connected ? 'platform-health-dot-ok' : 'platform-health-dot-bad'}`}
            />
            {db?.connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="page-subtitle" style={{ margin: 0 }}>
            {db?.pingMs != null ? `${db.pingMs} ms ping` : '—'}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Email Provider</span>
          <span className="stat-value">
            <span
              className={`platform-health-dot ${email?.configured ? 'platform-health-dot-ok' : 'platform-health-dot-bad'}`}
            />
            {email?.provider || '—'}
          </span>
          <span className="page-subtitle" style={{ margin: 0 }}>
            {email?.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">
            {hours}h {minutes}m
          </span>
        </div>
      </div>

      <div className="card">
        <h2>Last email attempt</h2>
        {!email?.lastAttempt ? (
          <p className="page-subtitle" style={{ margin: 0 }}>
            No email send attempts recorded since the server started.
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            <span
              className={`platform-health-dot ${email.lastAttempt.success ? 'platform-health-dot-ok' : 'platform-health-dot-bad'}`}
            />
            {email.lastAttempt.success ? 'Succeeded' : `Failed — ${email.lastAttempt.error || 'unknown error'}`}
            {' · '}
            {formatDateTime(email.lastAttempt.at)}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Process</h2>
        <p style={{ margin: 0 }}>Node {data?.nodeVersion}</p>
        <p className="page-subtitle" style={{ margin: '4px 0 0' }}>
          As of {data?.timestamp ? formatDateTime(data.timestamp) : '—'}
        </p>
      </div>
    </div>
  )
}
