import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerInvoices,
  getCustomers,
  updateCustomer,
} from '../services/customerService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'

const emptyForm = { name: '', phone: '', email: '', notes: '' }
const PAGE_SIZE = 20

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [detailId, setDetailId] = useState(null)

  const search = useDebouncedValue(searchInput, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: () => getCustomers({ search, page, limit: PAGE_SIZE }),
  })
  const customers = Array.isArray(data) ? data : data?.items || []
  const total = Array.isArray(data) ? customers.length : data?.total ?? customers.length
  const hasMore = page * PAGE_SIZE < total

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] })

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      invalidate()
      toast('Customer created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create customer', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCustomer(id, data),
    onSuccess: () => {
      invalidate()
      toast('Customer updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update customer', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      invalidate()
      toast('Customer deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete customer', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (customer) => {
    setEditing(customer)
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      notes: customer.notes || '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Search, manage, and review customer history</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Customer
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search by name or phone…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
        />
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading customers…" />
        ) : customers.length === 0 ? (
          <EmptyState title="No customers found" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c._id || c.id}
                    className="table-row-clickable"
                    onClick={() => setDetailId(c._id || c.id)}
                  >
                    <td>{c.name}</td>
                    <td>{c.phone}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.notes || '—'}</td>
                    <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-danger-text"
                        onClick={() => setDeleteTarget(c)}
                      >
                        Delete
                      </button>
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

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit Customer' : 'New Customer'}
        width="440px"
      >
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Name</span>
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Email (optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Notes (optional)</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Customer"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />

      <CustomerDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}

function CustomerDetailModal({ id, onClose }) {
  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => getCustomer(id),
    enabled: !!id,
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['customers', id, 'invoices'],
    queryFn: () => getCustomerInvoices(id, { page: 1, limit: 10 }),
    enabled: !!id,
  })
  const invoices = Array.isArray(invoicesData) ? invoicesData : invoicesData?.items || []

  return (
    <Modal open={!!id} onClose={onClose} title={customer?.name || 'Customer'} width="640px">
      {isLoading ? (
        <Spinner label="Loading customer…" />
      ) : (
        <>
          <p className="customer-detail-meta">
            {customer?.phone}
            {customer?.email ? ` · ${customer.email}` : ''}
          </p>
          {customer?.notes && <p className="page-subtitle">{customer.notes}</p>}

          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Visits</span>
              <span className="stat-value">{customer?.stats?.invoiceCount ?? 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Spent</span>
              <span className="stat-value">{formatCurrency(customer?.stats?.totalSpent)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Last Visit</span>
              <span className="stat-value">
                {customer?.stats?.lastVisit ? formatDate(customer.stats.lastVisit) : '—'}
              </span>
            </div>
          </div>

          <h2>Recent Invoices</h2>
          {invoicesLoading ? (
            <Spinner label="Loading invoices…" />
          ) : invoices.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id || inv.id}>
                    <td>{inv.invoiceNumber}</td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                    <td>{formatCurrency(inv.total)}</td>
                    <td>
                      <span
                        className={`badge ${
                          inv.paymentStatus === 'PAID' ? 'badge-success' : 'badge-muted'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  )
}
