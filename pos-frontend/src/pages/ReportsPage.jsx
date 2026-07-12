import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCancelledReport,
  getDailyReport,
  getDiscountsReport,
  getItemsReport,
  getPaymentsReport,
  getTaxReport,
} from '../services/reportService'
import { getSettings } from '../services/settingsService'
import { useBranchStore } from '../store/branchStore'
import { formatCurrency, formatDateTime, todayStr } from '../utils/format'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const TABS = [
  { key: 'daily', label: 'Daily Sales' },
  { key: 'items', label: 'Item Sales' },
  { key: 'payments', label: 'Payment Summary' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'tax', label: 'Tax Summary' },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('daily')
  const activeBranch = useBranchStore((s) => s.activeBranch)

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      {activeBranch === 'all' && (
        <p className="page-subtitle">Showing combined data across all branches</p>
      )}
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
      {tab === 'discounts' && <DiscountsTab />}
      {tab === 'cancelled' && <CancelledTab />}
      {tab === 'tax' && <TaxSummaryTab />}
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

function DiscountsTab() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'discounts', from, to],
    queryFn: () => getDiscountsReport(from, to),
  })

  const rows = data?.invoices || []

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
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Total Discount</span>
              <span className="stat-value">{formatCurrency(data?.totalDiscount, currency)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Invoices</span>
              <span className="stat-value">{data?.invoiceCount ?? 0}</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No discounts in this range" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Cashier</th>
                  <th>Subtotal</th>
                  <th>Discount</th>
                  <th>Amount</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.invoiceNumber}</td>
                    <td>{formatDateTime(row.date)}</td>
                    <td>{row.cashierName}</td>
                    <td>{formatCurrency(row.subtotal, currency)}</td>
                    <td>
                      {row.discountType === 'PERCENT'
                        ? `${row.discountValue}%`
                        : formatCurrency(row.discountValue, currency)}
                    </td>
                    <td>{formatCurrency(row.discount, currency)}</td>
                    <td>{formatCurrency(row.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function CancelledTab() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'cancelled', from, to],
    queryFn: () => getCancelledReport(from, to),
  })

  const rows = data?.invoices || []

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
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Cancelled</span>
              <span className="stat-value">{data?.count ?? 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Value</span>
              <span className="stat-value">{formatCurrency(data?.totalValue, currency)}</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No cancelled invoices in this range" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Cashier</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.invoiceNumber}</td>
                    <td>{formatDateTime(row.date)}</td>
                    <td>{row.cashierName}</td>
                    <td>{formatCurrency(row.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function TaxSummaryTab() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'tax', from, to],
    queryFn: () => getTaxReport(from, to),
  })

  const rows = data?.byRate || []

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
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Total Tax</span>
              <span className="stat-value">{formatCurrency(data?.totalTax, currency)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Taxable Sales</span>
              <span className="stat-value">{formatCurrency(data?.taxableSales, currency)}</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No taxable sales in this range" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tax Rate</th>
                  <th>Taxable Amount</th>
                  <th>Tax</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.taxRate}%</td>
                    <td>{formatCurrency(row.taxableAmount, currency)}</td>
                    <td>{formatCurrency(row.tax, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
