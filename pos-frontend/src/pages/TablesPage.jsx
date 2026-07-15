import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTable,
  deleteTable,
  getTables,
  mergeTable,
  transferTable,
  updateTable,
} from '../services/tableService'
import { createOrder } from '../services/orderService'
import { getSettings } from '../services/settingsService'
import { useAuthStore } from '../store/authStore'
import { useBranchStore } from '../store/branchStore'
import { useSocketEvents } from '../hooks/useSocketEvents'
import BranchRequiredNotice from '../components/BranchRequiredNotice'
import { toast } from '../store/toastStore'
import { formatCurrency } from '../utils/format'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import QRModal from '../components/QRModal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const STATUS_META = {
  FREE: { label: 'Free', className: 'table-card-free' },
  OCCUPIED: { label: 'Occupied', className: 'table-card-occupied' },
  BILLED: { label: 'Billed', className: 'table-card-billed' },
}

function elapsedSince(dateStr) {
  if (!dateStr) return null
  const ms = Date.now() - new Date(dateStr).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function TableCard({ table, onSeat, onOpenOrder, onTransfer, onMerge, canManageOrder }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = STATUS_META[table.status] || STATUS_META.FREE
  const order = table.order

  const handleClick = () => {
    if (table.status === 'FREE') onSeat(table)
    else onOpenOrder(table)
  }

  return (
    <div className={`table-card ${meta.className}`}>
      <button type="button" className="table-card-main" onClick={handleClick}>
        <div className="table-card-top">
          <span className="table-card-name">{table.name}</span>
          <span className="table-card-status-pill">{meta.label}</span>
        </div>
        <div className="table-card-capacity">Seats {table.capacity}</div>
        {order && (
          <div className="table-card-order-info">
            <span>{order.orderNumber}</span>
            <span>{order.guestCount} guests</span>
            <span>{formatCurrency(order.total)}</span>
            {elapsedSince(order.createdAt) && <span>{elapsedSince(order.createdAt)}</span>}
          </div>
        )}
      </button>
      {canManageOrder && table.status !== 'FREE' && (
        <div className="table-card-kebab-wrap">
          <button
            type="button"
            className="table-card-kebab"
            aria-label="Table actions"
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="table-card-menu" onMouseLeave={() => setMenuOpen(false)}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onTransfer(table)
                }}
              >
                Transfer
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onMerge(table)
                }}
              >
                Merge
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SeatGuestsModal({ table, onClose, onConfirm, isSubmitting }) {
  const [guestCount, setGuestCount] = useState(2)

  return (
    <Modal open={!!table} onClose={onClose} title={`Seat guests — ${table?.name || ''}`} width="360px">
      <label className="field split-ways-field">
        <span>Guest count</span>
        <div className="cart-line-controls">
          <button type="button" className="stepper-btn" onClick={() => setGuestCount((g) => Math.max(1, g - 1))}>
            −
          </button>
          <span className="stepper-qty">{guestCount}</span>
          <button type="button" className="stepper-btn" onClick={() => setGuestCount((g) => g + 1)}>
            +
          </button>
        </div>
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isSubmitting}
          onClick={() => onConfirm(guestCount)}
        >
          {isSubmitting ? 'Seating…' : 'Seat Guests'}
        </button>
      </div>
    </Modal>
  )
}

function TransferMergeModal({ mode, table, tables, onClose, onConfirm, isSubmitting }) {
  const [targetId, setTargetId] = useState('')
  const isTransfer = mode === 'transfer'
  const candidates = isTransfer
    ? tables.filter((t) => t.status === 'FREE')
    : tables.filter((t) => t.status === 'OCCUPIED' && (t._id || t.id) !== (table?._id || table?.id))

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={isTransfer ? `Transfer order from ${table?.name}` : `Merge into ${table?.name}`}
      width="400px"
    >
      {candidates.length === 0 ? (
        <EmptyState
          title={isTransfer ? 'No free tables' : 'No other occupied tables'}
          message={isTransfer ? 'All tables are currently in use.' : 'There are no other orders to merge.'}
        />
      ) : (
        <>
          <label className="field">
            <span>{isTransfer ? 'Move to' : 'Merge order from'}</span>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select table…</option>
              {candidates.map((t) => (
                <option key={t._id || t.id} value={t._id || t.id}>
                  {t.name} {t.order ? `(${t.order.orderNumber})` : ''}
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
              disabled={!targetId || isSubmitting}
              onClick={() => onConfirm(targetId)}
            >
              {isSubmitting ? 'Working…' : isTransfer ? 'Transfer' : 'Merge'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

const emptyTableForm = { name: '', zone: '', capacity: 4 }

function ManageTablesModal({ open, onClose, tables, showQr }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyTableForm)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [qrTarget, setQrTarget] = useState(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tables'] })

  const createMutation = useMutation({
    mutationFn: createTable,
    onSuccess: () => {
      invalidate()
      toast('Table created', 'success')
      closeForm()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create table', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateTable(id, data),
    onSuccess: () => {
      invalidate()
      toast('Table updated', 'success')
      closeForm()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update table', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTable,
    onSuccess: () => {
      invalidate()
      toast('Table deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete table', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyTableForm)
    setShowForm(true)
  }

  const openEdit = (t) => {
    setEditing(t)
    setForm({ name: t.name || '', zone: t.zone || '', capacity: t.capacity ?? 4 })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(emptyTableForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { name: form.name, zone: form.zone, capacity: Number(form.capacity) || 1 }
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Tables" width="600px">
      {!showForm ? (
        <>
          <div className="modal-actions manage-tables-toolbar">
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              + New Table
            </button>
          </div>
          {tables.length === 0 ? (
            <EmptyState title="No tables yet" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Zone</th>
                  <th>Capacity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t._id || t.id}>
                    <td>{t.name}</td>
                    <td>{t.zone || '—'}</td>
                    <td>{t.capacity}</td>
                    <td className="table-actions">
                      {showQr && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setQrTarget(t)}>
                          QR
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-danger-text"
                        onClick={() => setDeleteTarget(t)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
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
          <div className="field-row">
            <label className="field">
              <span>Zone</span>
              <input
                value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Capacity</span>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closeForm}>
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
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Table"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />

      {showQr && <QRModal table={qrTarget} onClose={() => setQrTarget(null)} />}
    </Modal>
  )
}

export default function TablesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeBranch = useBranchStore((s) => s.activeBranch)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const canManageTables = hasPermission('tables.manage')

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const showQr = canManageTables && !!settings?.features?.onlineOrdering

  const [seatTarget, setSeatTarget] = useState(null)
  const [actionMode, setActionMode] = useState(null) // 'transfer' | 'merge' | null
  const [actionTable, setActionTable] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: getTables,
    refetchInterval: 15000,
  })
  const tables = Array.isArray(data) ? data : data?.items || []

  const invalidateTables = () => queryClient.invalidateQueries({ queryKey: ['tables'] })

  useSocketEvents({
    'table.updated': invalidateTables,
    'order.updated': invalidateTables,
  })

  const seatMutation = useMutation({
    mutationFn: ({ tableId, guestCount }) =>
      createOrder({ tableId, guestCount, type: 'DINE_IN' }),
    onSuccess: (order) => {
      invalidateTables()
      navigate(`/orders/${order._id || order.id}`)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to seat guests', 'error'),
  })

  const transferMutation = useMutation({
    mutationFn: ({ tableId, toTableId }) => transferTable(tableId, toTableId),
    onSuccess: () => {
      invalidateTables()
      toast('Table transferred', 'success')
      setActionMode(null)
      setActionTable(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Transfer failed', 'error'),
  })

  const mergeMutation = useMutation({
    mutationFn: ({ tableId, fromTableId }) => mergeTable(tableId, fromTableId),
    onSuccess: () => {
      invalidateTables()
      toast('Tables merged', 'success')
      setActionMode(null)
      setActionTable(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Merge failed', 'error'),
  })

  const zoneMap = {}
  tables.forEach((t) => {
    const zone = t.zone || 'Other'
    zoneMap[zone] = zoneMap[zone] || []
    zoneMap[zone].push(t)
  })
  const zones = Object.entries(zoneMap)

  const openOrder = (table) => {
    const orderId = table.currentOrderId || table.order?._id || table.order?.id
    if (orderId) navigate(`/orders/${orderId}`)
  }

  if (activeBranch === 'all') return <BranchRequiredNotice />

  if (isLoading) return <Spinner label="Loading tables…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tables</h1>
          <p className="page-subtitle">Tap a free table to seat guests, or an occupied table to open its order</p>
        </div>
        {canManageTables && (
          <button className="btn btn-primary" onClick={() => setManageOpen(true)}>
            Manage Tables
          </button>
        )}
      </div>

      {tables.length === 0 ? (
        <EmptyState title="No tables configured" message="Ask an admin to add tables in Manage Tables." />
      ) : (
        zones.map(([zone, zoneTables]) => (
          <div key={zone} className="table-zone">
            <h3 className="table-zone-title">{zone}</h3>
            <div className="table-grid">
              {zoneTables.map((t) => (
                <TableCard
                  key={t._id || t.id}
                  table={t}
                  canManageOrder
                  onSeat={setSeatTarget}
                  onOpenOrder={openOrder}
                  onTransfer={(table) => {
                    setActionTable(table)
                    setActionMode('transfer')
                  }}
                  onMerge={(table) => {
                    setActionTable(table)
                    setActionMode('merge')
                  }}
                />
              ))}
            </div>
          </div>
        ))
      )}

      <SeatGuestsModal
        table={seatTarget}
        isSubmitting={seatMutation.isPending}
        onClose={() => setSeatTarget(null)}
        onConfirm={(guestCount) =>
          seatMutation.mutate({ tableId: seatTarget._id || seatTarget.id, guestCount })
        }
      />

      <TransferMergeModal
        mode={actionMode}
        table={actionTable}
        tables={tables}
        isSubmitting={transferMutation.isPending || mergeMutation.isPending}
        onClose={() => {
          setActionMode(null)
          setActionTable(null)
        }}
        onConfirm={(targetId) => {
          const tableId = actionTable._id || actionTable.id
          if (actionMode === 'transfer') {
            transferMutation.mutate({ tableId, toTableId: targetId })
          } else {
            mergeMutation.mutate({ tableId, fromTableId: targetId })
          }
        }}
      />

      {canManageTables && (
        <ManageTablesModal
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          tables={tables}
          showQr={showQr}
        />
      )}
    </div>
  )
}
