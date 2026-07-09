import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getDailyReport,
  getItemsReport,
  getPaymentsReport,
} from '../services/reportService'
import { getSettings } from '../services/settingsService'
import { formatCurrency, todayStr } from '../utils/format'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const TABS = [
  { key: 'daily', label: 'Daily Sales' },
  { key: 'items', label: 'Item Sales' },
  { key: 'payments', label: 'Payment Summary' },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('daily')

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && <DailySalesTab />}
      {tab === 'items' && <ItemSalesTab />}
      {tab === 'payments' && <PaymentSummaryTab />}
    </div>
  )
}

function DailySalesTab() {
  const [date, setDate] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'daily', date],
    queryFn: () => getDailyReport(date),
  })

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <Spinner label="Loading report…" />
      ) : (
        <div className="stat-cards">
          <div className="stat-card">
            <span className="stat-label">Invoices</span>
            <span className="stat-value">{data?.invoiceCount ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Gross</span>
            <span className="stat-value">{formatCurrency(data?.gross, currency)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tax</span>
            <span className="stat-value">{formatCurrency(data?.tax, currency)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Discount</span>
            <span className="stat-value">{formatCurrency(data?.discount, currency)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Net</span>
            <span className="stat-value">{formatCurrency(data?.net, currency)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Cancelled</span>
            <span className="stat-value">{data?.cancelled ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemSalesTab() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'items', from, to],
    queryFn: () => getItemsReport(from, to),
  })

  const rows = Array.isArray(data) ? data : data?.items || []

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <Spinner label="Loading report…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No item sales in this range" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty Sold</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>{row.name}</td>
                <td>{row.qty}</td>
                <td>{formatCurrency(row.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PaymentSummaryTab() {
  const [date, setDate] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'payments', date],
    queryFn: () => getPaymentsReport(date),
  })

  const rows = Array.isArray(data) ? data : data?.byPaymentMethod || data?.items || []

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <Spinner label="Loading report…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No payments for this date" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Count</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>{row.method}</td>
                <td>{row.count}</td>
                <td>{formatCurrency(row.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
