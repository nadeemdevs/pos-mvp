import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getAnalyticsOverview,
  getChannelBreakdown,
  getInventoryValue,
  getItemProfitability,
  getPeakHours,
} from '../services/analyticsService'
import { getSettings } from '../services/settingsService'
import { useBranchStore } from '../store/branchStore'
import { formatCurrency, todayStr } from '../utils/format'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

function daysAgoStr(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const QUICK_RANGES = [
  { key: 'today', label: 'Today', from: () => todayStr(), to: () => todayStr() },
  { key: '7d', label: '7d', from: () => daysAgoStr(6), to: () => todayStr() },
  { key: '30d', label: '30d', from: () => daysAgoStr(29), to: () => todayStr() },
]

export default function AnalyticsPage() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [activeRange, setActiveRange] = useState('today')
  const activeBranch = useBranchStore((s) => s.activeBranch)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'
  const inventoryEnabled = !!settings?.features?.inventory

  const applyRange = (range) => {
    setActiveRange(range.key)
    setFrom(range.from())
    setTo(range.to())
  }

  const queryOpts = { retry: false }

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', from, to],
    queryFn: () => getAnalyticsOverview(from, to),
    ...queryOpts,
  })

  const { data: peakHours, isLoading: peakLoading } = useQuery({
    queryKey: ['analytics', 'peak-hours', from, to],
    queryFn: () => getPeakHours(from, to),
    ...queryOpts,
  })

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['analytics', 'items', from, to],
    queryFn: () => getItemProfitability(from, to),
    ...queryOpts,
  })

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['analytics', 'channels', from, to],
    queryFn: () => getChannelBreakdown(from, to),
    ...queryOpts,
  })

  const { data: inventoryValueData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['analytics', 'inventory-value', from, to],
    queryFn: () => getInventoryValue(from, to),
    enabled: inventoryEnabled,
    ...queryOpts,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Revenue, profitability and channel performance</p>
          {activeBranch === 'all' && (
            <p className="page-subtitle">Showing combined data across all branches</p>
          )}
        </div>
        <div className="analytics-range-controls">
          <div className="chip-row">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`chip ${activeRange === r.key ? 'active' : ''}`}
                onClick={() => applyRange(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="field-row">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setActiveRange(null)
                  setFrom(e.target.value)
                }}
              />
            </label>
            <label className="field">
              <span>To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setActiveRange(null)
                  setTo(e.target.value)
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <OverviewCards data={overview} loading={overviewLoading} currency={currency} />

      <PeakHoursCard data={peakHours} loading={peakLoading} currency={currency} />

      <ItemProfitabilityCard data={itemsData} loading={itemsLoading} currency={currency} />

      <ChannelsCard data={channelsData} loading={channelsLoading} currency={currency} />

      {inventoryEnabled && (
        <InventoryValueCard data={inventoryValueData} loading={inventoryLoading} currency={currency} />
      )}
    </div>
  )
}

function OverviewCards({ data, loading, currency }) {
  if (loading) return <Spinner label="Loading overview…" />
  const foodCostPct = data?.foodCostPct ?? (data?.revenue ? ((data?.foodCost || 0) / data.revenue) * 100 : 0)
  return (
    <div className="stat-cards">
      <div className="stat-card">
        <span className="stat-label">Revenue</span>
        <span className="stat-value">{formatCurrency(data?.revenue, currency)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Invoices</span>
        <span className="stat-value">{data?.invoiceCount ?? 0}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Avg Ticket</span>
        <span className="stat-value">{formatCurrency(data?.avgTicket, currency)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Food Cost</span>
        <span className="stat-value">
          {formatCurrency(data?.foodCost, currency)}
          <span className="stat-value-sub"> ({foodCostPct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Gross Profit</span>
        <span className="stat-value">{formatCurrency(data?.grossProfit, currency)}</span>
      </div>
    </div>
  )
}

function PeakHoursCard({ data, loading, currency }) {
  const byHour = useMemo(() => {
    const rows = Array.isArray(data) ? data : data?.items || []
    const map = new Map(rows.map((r) => [Number(r.hour), r]))
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: map.get(hour)?.revenue || 0,
      count: map.get(hour)?.count || 0,
    }))
  }, [data])
  const rows = Array.isArray(data) ? data : data?.items || []
  const maxRevenue = Math.max(1, ...byHour.map((h) => h.revenue))

  return (
    <div className="card">
      <h2>Peak Hours</h2>
      {loading ? (
        <Spinner label="Loading peak hours…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No sales data in this range" />
      ) : (
        <div className="peak-hours-chart">
          {byHour.map((h) => (
            <div key={h.hour} className="peak-hours-bar-wrap">
              <div
                className="peak-hours-bar"
                title={`${formatCurrency(h.revenue, currency)} · ${h.count} orders`}
                style={{ height: `${Math.max(2, (h.revenue / maxRevenue) * 100)}%` }}
              />
              <span className="peak-hours-label">
                {h.hour % 3 === 0 ? `${h.hour}:00` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ITEM_COLUMNS = [
  { key: 'name', label: 'Item' },
  { key: 'qty', label: 'Qty' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'foodCost', label: 'Food Cost' },
  { key: 'margin', label: 'Margin' },
  { key: 'marginPct', label: 'Margin %' },
]

function ItemProfitabilityCard({ data, loading, currency }) {
  const rows = Array.isArray(data) ? data : data?.items || []
  const [sortKey, setSortKey] = useState('revenue')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    const source = Array.isArray(data) ? data : data?.items || []
    const copy = [...source]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = Number(av) || 0
      const bn = Number(bv) || 0
      return sortDir === 'asc' ? an - bn : bn - an
    })
    return copy
  }, [data, sortKey, sortDir])

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="card">
      <h2>Item Profitability</h2>
      {loading ? (
        <Spinner label="Loading items…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No item sales in this range" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              {ITEM_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="sortable-th"
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={row.name || idx}>
                <td>{row.name}</td>
                <td>{row.qty ?? 0}</td>
                <td>{formatCurrency(row.revenue, currency)}</td>
                <td>{formatCurrency(row.foodCost, currency)}</td>
                <td>{formatCurrency(row.margin, currency)}</td>
                <td className={Number(row.marginPct) >= 0 ? 'margin-positive' : 'margin-negative'}>
                  {Number(row.marginPct ?? 0).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const CHANNEL_LABELS = {
  POS: 'POS',
  QR: 'QR Ordering',
  ONLINE: 'Online',
  DELIVERY: 'Delivery',
}

function ChannelsCard({ data, loading, currency }) {
  const rows = Array.isArray(data) ? data : data?.items || []
  const total = rows.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0)

  return (
    <div className="card">
      <h2>Channels</h2>
      {loading ? (
        <Spinner label="Loading channels…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No channel data in this range" />
      ) : (
        <div className="channel-list">
          {rows.map((row) => {
            const pct = total > 0 ? ((Number(row.revenue) || 0) / total) * 100 : 0
            return (
              <div key={row.channel} className="channel-row">
                <span className={`channel-pill channel-pill-${(row.channel || '').toLowerCase()}`}>
                  {CHANNEL_LABELS[row.channel] || row.channel}
                </span>
                <span className="channel-revenue">{formatCurrency(row.revenue, currency)}</span>
                <span className="channel-count">{row.count ?? 0} orders</span>
                <div className="channel-share-track">
                  <div className="channel-share-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="channel-share-pct">{pct.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InventoryValueCard({ data, loading, currency }) {
  const items = Array.isArray(data?.items) ? data.items : []
  const top10 = useMemo(
    () => [...(Array.isArray(data?.items) ? data.items : [])].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 10),
    [data],
  )

  return (
    <div className="card">
      <h2>Inventory Value</h2>
      {loading ? (
        <Spinner label="Loading inventory value…" />
      ) : items.length === 0 ? (
        <EmptyState title="No inventory value data" />
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Total Value</span>
              <span className="stat-value">{formatCurrency(data?.totalValue, currency)}</span>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Current Stock</th>
                <th>Avg Cost</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((row, idx) => (
                <tr key={row.name || idx}>
                  <td>{row.name}</td>
                  <td>{row.currentStock ?? 0}</td>
                  <td>{formatCurrency(row.avgCost, currency)}</td>
                  <td>{formatCurrency(row.value, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
