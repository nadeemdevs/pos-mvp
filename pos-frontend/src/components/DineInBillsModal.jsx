import { useQuery } from '@tanstack/react-query'
import Modal from './Modal'
import Spinner from './Spinner'
import EmptyState from './EmptyState'
import { getOrders } from '../services/orderService'
import { formatCurrency } from '../utils/format'
import { useSocketEvents } from '../hooks/useSocketEvents'
import { useQueryClient } from '@tanstack/react-query'

const STATUS_LABEL = {
  BILL_REQUESTED: 'Bill Requested',
  OPEN: 'Open',
}

// Lists active dine-in orders a cashier can generate an invoice for —
// BILL_REQUESTED orders are surfaced first (guests are waiting), OPEN orders
// follow as a secondary group for cashiers who want to bill ahead of a
// formal request.
export default function DineInBillsModal({ open, onClose, onSelectOrder }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => getOrders({ active: true }),
    enabled: open,
  })

  useSocketEvents({
    'order.updated': () => queryClient.invalidateQueries({ queryKey: ['orders', 'active'] }),
    'order.created': () => queryClient.invalidateQueries({ queryKey: ['orders', 'active'] }),
  })

  const orders = Array.isArray(data) ? data : data?.items || []
  const billable = orders.filter((o) => o.status === 'BILL_REQUESTED' || o.status === 'OPEN')
  const sorted = [...billable].sort((a, b) => {
    if (a.status === b.status) return 0
    return a.status === 'BILL_REQUESTED' ? -1 : 1
  })

  return (
    <Modal open={open} onClose={onClose} title="Dine-in Bills" width="560px">
      {isLoading ? (
        <Spinner label="Loading orders…" />
      ) : sorted.length === 0 ? (
        <EmptyState title="No orders awaiting billing" message="Requested and open dine-in orders will appear here." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Order #</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o._id || o.id}>
                <td>{o.tableName || '—'}</td>
                <td>{o.orderNumber}</td>
                <td>
                  <span
                    className={`badge ${o.status === 'BILL_REQUESTED' ? 'badge-warning' : 'badge-muted'}`}
                  >
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </td>
                <td>{formatCurrency(o.total)}</td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={() => onSelectOrder(o)}>
                    Bill
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
