import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInvoices } from '../services/invoiceService'
import { getSettings } from '../services/settingsService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import InvoiceDetailModal from '../components/InvoiceDetailModal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { formatCurrency, formatDateTime } from '../utils/format'

const PAGE_SIZE = 20

const STATUS_BADGE = {
  PENDING: 'badge-warning',
  PAID: 'badge-success',
  REFUNDED: 'badge-danger',
}

export default function InvoicesPage() {
  const [searchInput, setSearchInput] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState(null)

  const search = useDebouncedValue(searchInput, 300)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const currency = settings?.currency || 'INR'

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { search, paymentStatus, page }],
    queryFn: () => getInvoices({ search, paymentStatus: paymentStatus || undefined, page, limit: PAGE_SIZE }),
  })
  const invoices = data?.items || []
  const total = data?.total ?? invoices.length
  const hasMore = page * PAGE_SIZE < total

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Look up a past bill to edit, cancel, or refund it</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search by invoice #, phone, or customer name…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
        />
        <select
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">All payment statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading invoices…" />
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices found" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv._id || inv.id}
                    className="table-row-clickable"
                    onClick={() => setDetailId(inv._id || inv.id)}
                  >
                    <td>{inv.invoiceNumber}</td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                    <td>{inv.customer?.name || inv.customer?.phone || '—'}</td>
                    <td>{formatCurrency(inv.total, currency)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[inv.paymentStatus] || 'badge-muted'}`}>
                        {inv.paymentStatus}
                      </span>
                    </td>
                    <td>{inv.status}</td>
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

      <InvoiceDetailModal
        invoiceId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        currency={currency}
      />
    </div>
  )
}
