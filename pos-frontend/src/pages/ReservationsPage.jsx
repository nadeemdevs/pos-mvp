import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelReservation,
  createReservation,
  getReservations,
  noShowReservation,
  seatReservation,
  updateReservation,
} from '../services/reservationService'
import { getTables } from '../services/tableService'
import { useSocketEvents } from '../hooks/useSocketEvents'
import { toast } from '../store/toastStore'
import { todayStr } from '../utils/format'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import CustomerLookup from '../components/CustomerLookup'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'BOOKED', label: 'Booked' },
  { value: 'SEATED', label: 'Seated' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No-show' },
]

const STATUS_PILL_CLASS = {
  BOOKED: 'status-pill-processing',
  SEATED: 'status-pill-success',
  COMPLETED: 'status-pill-success',
  CANCELLED: 'status-pill-cancelled',
  NO_SHOW: 'status-pill-failed',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const emptyForm = {
  customer: { name: '', phone: '' },
  partySize: 2,
  scheduledDate: todayStr(),
  scheduledTime: '19:00',
  tableId: '',
  note: '',
}

function ReservationFormModal({ open, onClose, editing, tables, onSubmit, isSubmitting }) {
  const [form, setForm] = useState(emptyForm)

  const [initialized, setInitialized] = useState(false)
  if (open && !initialized) {
    if (editing) {
      const d = editing.scheduledAt ? new Date(editing.scheduledAt) : new Date()
      const scheduledDate = d.toISOString().slice(0, 10)
      const scheduledTime = d.toTimeString().slice(0, 5)
      setForm({
        customer: { name: editing.customer?.name || '', phone: editing.customer?.phone || '' },
        partySize: editing.partySize || 2,
        scheduledDate,
        scheduledTime,
        tableId: editing.tableId || '',
        note: editing.note || '',
      })
    } else {
      setForm(emptyForm)
    }
    setInitialized(true)
  }
  if (!open && initialized) setInitialized(false)

  const freeTables = tables.filter((t) => t.status === 'FREE')

  const handleSubmit = (e) => {
    e.preventDefault()
    const scheduledAt = new Date(`${form.scheduledDate}T${form.scheduledTime}:00`).toISOString()
    onSubmit({
      customer: form.customer,
      partySize: Number(form.partySize) || 1,
      scheduledAt,
      tableId: form.tableId || undefined,
      note: form.note || undefined,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Reservation' : 'New Reservation'} width="480px">
      <form onSubmit={handleSubmit}>
        <CustomerLookup
          customer={form.customer}
          onFieldChange={(customer) => setForm((f) => ({ ...f, customer }))}
          onSelect={(customer) => setForm((f) => ({ ...f, customer }))}
          onClear={() => setForm((f) => ({ ...f, customer: { name: '', phone: '' } }))}
        />

        <label className="field split-ways-field">
          <span>Party size</span>
          <div className="cart-line-controls">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setForm((f) => ({ ...f, partySize: Math.max(1, Number(f.partySize) - 1) }))}
            >
              −
            </button>
            <span className="stepper-qty">{form.partySize}</span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => setForm((f) => ({ ...f, partySize: Number(f.partySize) + 1 }))}
            >
              +
            </button>
          </div>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              required
              value={form.scheduledDate}
              onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Time</span>
            <input
              type="time"
              required
              value={form.scheduledTime}
              onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
            />
          </label>
        </div>

        <label className="field">
          <span>Table preference (optional)</span>
          <select value={form.tableId} onChange={(e) => setForm((f) => ({ ...f, tableId: e.target.value }))}>
            <option value="">No preference</option>
            {freeTables.map((t) => (
              <option key={t._id || t.id} value={t._id || t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Note (optional)</span>
          <textarea
            rows={2}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SeatModal({ reservation, tables, onClose, onConfirm, isSubmitting }) {
  const [tableId, setTableId] = useState('')
  const freeTables = tables.filter((t) => t.status === 'FREE')

  return (
    <Modal open={!!reservation} onClose={onClose} title={`Seat — ${reservation?.reservationNumber || ''}`} width="360px">
      {freeTables.length === 0 ? (
        <EmptyState title="No free tables" message="All tables are currently in use." />
      ) : (
        <>
          <label className="field">
            <span>Table</span>
            <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Select table…</option>
              {freeTables.map((t) => (
                <option key={t._id || t.id} value={t._id || t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!tableId || isSubmitting}
              onClick={() => onConfirm(tableId)}
            >
              {isSubmitting ? 'Seating…' : 'Seat'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function ReservationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayStr())
  const [status, setStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [seatTarget, setSeatTarget] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', { date, status }],
    queryFn: () => getReservations({ date, status: status || undefined }),
    refetchInterval: 30000,
  })
  const reservations = Array.isArray(data) ? data : data?.items || []
  const sorted = [...reservations].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
  )

  const { data: tablesData } = useQuery({ queryKey: ['tables'], queryFn: getTables })
  const tables = Array.isArray(tablesData) ? tablesData : tablesData?.items || []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reservations'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  }

  useSocketEvents({
    'reservation.updated': invalidate,
    'table.updated': invalidate,
  })

  const createMutation = useMutation({
    mutationFn: createReservation,
    onSuccess: () => {
      invalidate()
      toast('Reservation created', 'success')
      closeForm()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create reservation', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => updateReservation(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Reservation updated', 'success')
      closeForm()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update reservation', 'error'),
  })

  const seatMutation = useMutation({
    mutationFn: ({ id, tableId }) => seatReservation(id, { tableId }),
    onSuccess: (result) => {
      invalidate()
      toast('Guests seated', 'success')
      setSeatTarget(null)
      const orderId = result?.order?._id || result?.order?.id
      if (orderId) navigate(`/orders/${orderId}`)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to seat reservation', 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelReservation,
    onSuccess: () => {
      invalidate()
      toast('Reservation cancelled', 'success')
      setCancelTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to cancel reservation', 'error'),
  })

  const noShowMutation = useMutation({
    mutationFn: noShowReservation,
    onSuccess: () => {
      invalidate()
      toast('Marked as no-show', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update reservation', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }

  const handleSubmit = (payload) => {
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reservations</h1>
          <p className="page-subtitle">Book, seat, and track table reservations</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Reservation
        </button>
      </div>

      <div className="toolbar">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="chip-row">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip ${status === f.value ? 'active' : ''}`}
              onClick={() => setStatus(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading reservations…" />
        ) : sorted.length === 0 ? (
          <EmptyState title="No reservations for this date" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Reservation #</th>
                <th>Customer</th>
                <th>Party</th>
                <th>Table</th>
                <th>Note</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r._id || r.id}>
                  <td>{formatTime(r.scheduledAt)}</td>
                  <td>{r.reservationNumber}</td>
                  <td>
                    {r.customer?.name}
                    <br />
                    <span className="page-subtitle">{r.customer?.phone}</span>
                  </td>
                  <td>{r.partySize}</td>
                  <td>{r.tableName || '—'}</td>
                  <td>{r.note || '—'}</td>
                  <td>
                    <span className={`status-pill ${STATUS_PILL_CLASS[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="table-actions">
                    {r.status === 'BOOKED' && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSeatTarget(r)}>
                          Seat
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-danger-text"
                          onClick={() => setCancelTarget(r)}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => noShowMutation.mutate(r._id || r.id)}
                        >
                          No-show
                        </button>
                      </>
                    )}
                    {r.status === 'SEATED' && r.orderId && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/orders/${r.orderId}`)}
                      >
                        Open Order
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ReservationFormModal
        open={formOpen}
        onClose={closeForm}
        editing={editing}
        tables={tables}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <SeatModal
        reservation={seatTarget}
        tables={tables}
        onClose={() => setSeatTarget(null)}
        onConfirm={(tableId) => seatMutation.mutate({ id: seatTarget._id || seatTarget.id, tableId })}
        isSubmitting={seatMutation.isPending}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel Reservation"
        message={`Cancel reservation ${cancelTarget?.reservationNumber}?`}
        confirmLabel="Cancel Reservation"
        danger
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate(cancelTarget._id || cancelTarget.id)}
      />
    </div>
  )
}
