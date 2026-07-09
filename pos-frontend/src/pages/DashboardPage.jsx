import { useQuery } from '@tanstack/react-query'
import { getDailyReport } from '../services/reportService'
import { getSettings } from '../services/settingsService'
import { formatCurrency, todayStr } from '../utils/format'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

export default function DashboardPage() {
  const today = todayStr()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports', 'daily', today],
    queryFn: () => getDailyReport(today),
  })

  const currency = settings?.currency || 'INR'

  if (isLoading) return <Spinner label="Loading dashboard…" />
  if (isError) return <EmptyState title="Could not load dashboard" />

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Today's overview — {today}</p>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Sales (Net)</span>
          <span className="stat-value">{formatCurrency(data?.net, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Invoices</span>
          <span className="stat-value">{data?.invoiceCount ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tax Collected</span>
          <span className="stat-value">{formatCurrency(data?.tax, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Discounts</span>
          <span className="stat-value">{formatCurrency(data?.discount, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Gross Sales</span>
          <span className="stat-value">{formatCurrency(data?.gross, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cancelled</span>
          <span className="stat-value">{data?.cancelled ?? 0}</span>
        </div>
      </div>

      <div className="card">
        <h2>Payment Method Breakdown</h2>
        {data?.byPaymentMethod?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Count</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.byPaymentMethod.map((row) => (
                <tr key={row.method}>
                  <td>{row.method}</td>
                  <td>{row.count}</td>
                  <td>{formatCurrency(row.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No payments yet today" />
        )}
      </div>
    </div>
  )
}
