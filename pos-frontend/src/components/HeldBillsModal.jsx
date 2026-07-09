import { useQuery } from '@tanstack/react-query'
import Modal from './Modal'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import { getInvoices } from '../services/invoiceService'
import { formatCurrency, formatDateTime } from '../utils/format'

export default function HeldBillsModal({ open, onClose, onResume }) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'held'],
    queryFn: () => getInvoices({ status: 'HELD', paymentStatus: 'PENDING' }),
    enabled: open,
  })

  const heldBills = Array.isArray(data) ? data : data?.items || []

  return (
    <Modal open={open} onClose={onClose} title="Held Bills" width="560px">
      {isLoading ? (
        <Spinner label="Loading held bills…" />
      ) : heldBills.length === 0 ? (
        <EmptyState title="No held bills" message="Bills you hold will appear here." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Note</th>
              <th>Time</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {heldBills.map((inv) => (
              <tr key={inv._id || inv.id}>
                <td>{inv.invoiceNumber}</td>
                <td>{inv.customer?.name || '—'}</td>
                <td>
                  {inv.note ? <span className="held-note">{inv.note}</span> : '—'}
                </td>
                <td>{formatDateTime(inv.createdAt)}</td>
                <td>{formatCurrency(inv.total)}</td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={() => onResume(inv)}>
                    Resume
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
