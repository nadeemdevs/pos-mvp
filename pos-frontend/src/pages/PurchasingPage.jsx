import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getInventoryItems } from '../services/inventoryService'
import {
  createVendor,
  deleteVendor,
  getVendors,
  updateVendor,
} from '../services/vendorService'
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrders,
  placePurchaseOrder,
  receivePurchaseOrder,
  updatePurchaseOrder,
} from '../services/purchaseOrderService'
import { getBranches } from '../services/branchService'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { useBranchStore } from '../store/branchStore'
import { formatCurrency, formatDate, formatDateTime } from '../utils/format'

const STATUS_CHIPS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Placed', value: 'PLACED' },
  { label: 'Partial', value: 'PARTIALLY_RECEIVED' },
  { label: 'Received', value: 'RECEIVED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

const STATUS_LABELS = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  PARTIALLY_RECEIVED: 'Partial',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
}

const STATUS_PILL_CLASS = {
  DRAFT: 'status-pill-draft',
  PLACED: 'status-pill-placed',
  PARTIALLY_RECEIVED: 'status-pill-partial',
  RECEIVED: 'status-pill-received',
  CANCELLED: 'status-pill-cancelled',
}

function StatusPill({ status }) {
  return (
    <span className={`status-pill ${STATUS_PILL_CLASS[status] || 'status-pill-draft'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

const emptyVendorForm = { name: '', phone: '', email: '', gstin: '', address: '', active: true }

export default function PurchasingPage() {
  const [tab, setTab] = useState('orders')

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchasing</h1>
          <p className="page-subtitle">Vendors and purchase orders</p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${tab === 'orders' ? 'active' : ''}`}
          onClick={() => setTab('orders')}
        >
          Purchase Orders
        </button>
        <button
          className={`tab-btn ${tab === 'vendors' ? 'active' : ''}`}
          onClick={() => setTab('vendors')}
        >
          Vendors
        </button>
      </div>

      {tab === 'orders' ? <PurchaseOrdersTab /> : <VendorsTab />}
    </div>
  )
}

function VendorsTab() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyVendorForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['vendors'], queryFn: getVendors })
  const vendors = Array.isArray(data) ? data : data?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vendors'] })

  const createMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: () => {
      invalidate()
      toast('Vendor created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create vendor', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => updateVendor(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Vendor updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update vendor', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      invalidate()
      toast('Vendor deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete vendor', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyVendorForm)
    setModalOpen(true)
  }

  const openEdit = (vendor) => {
    setEditing(vendor)
    setForm({
      name: vendor.name || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      gstin: vendor.gstin || '',
      address: vendor.address || '',
      active: vendor.active ?? true,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyVendorForm)
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
      <div className="toolbar-spread">
        <span />
        <button className="btn btn-primary" onClick={openCreate}>
          + New Vendor
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading vendors…" />
        ) : vendors.length === 0 ? (
          <EmptyState title="No vendors yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>GSTIN</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v._id || v.id}>
                  <td>{v.name}</td>
                  <td>{v.phone || '—'}</td>
                  <td>{v.email || '—'}</td>
                  <td>{v.gstin || '—'}</td>
                  <td>
                    <span className={`badge ${v.active === false ? 'badge-muted' : 'badge-success'}`}>
                      {v.active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => setDeleteTarget(v)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit Vendor' : 'New Vendor'}
        width="480px"
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
          <div className="field-row">
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>GSTIN</span>
            <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          </label>
          <label className="field">
            <span>Address</span>
            <textarea
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>Active</span>
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
        title="Delete Vendor"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />
    </div>
  )
}

const emptyLine = { inventoryItemId: '', qty: '', unitCost: '' }
const emptyPOForm = { vendorId: '', items: [{ ...emptyLine }], expectedAt: '', note: '' }

function PurchaseOrdersTab() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPO, setEditingPO] = useState(null)
  const [form, setForm] = useState(emptyPOForm)
  const [detailId, setDetailId] = useState(null)

  const activeBranch = useBranchStore((s) => s.activeBranch)
  const showBranchColumn = activeBranch === 'all'

  // Only needed to resolve a branchId -> display name for the combined
  // "All Branches" unfiltered side-by-side list — not a merge/sum of rows.
  const { data: branchesForColumn } = useQuery({
    queryKey: ['branches'],
    queryFn: () => getBranches(),
    enabled: showBranchColumn,
    retry: false,
  })
  const branchesList = Array.isArray(branchesForColumn) ? branchesForColumn : branchesForColumn?.items || []
  const branchName = (code) => branchesList.find((b) => b.code === code)?.name || code || '—'

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { status: statusFilter }],
    queryFn: () => getPurchaseOrders({ ...(statusFilter ? { status: statusFilter } : {}) }),
  })
  const pos = Array.isArray(data) ? data : data?.items || []
  const selectedPO = pos.find((p) => (p._id || p.id) === detailId) || null

  const { data: vendorsData } = useQuery({ queryKey: ['vendors'], queryFn: getVendors })
  const vendors = Array.isArray(vendorsData) ? vendorsData : vendorsData?.items || []

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory', 'po-options'],
    queryFn: () => getInventoryItems({ limit: 100 }),
  })
  const inventoryItems = Array.isArray(inventoryData) ? inventoryData : inventoryData?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })

  const createMutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      invalidate()
      toast('Purchase order created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create purchase order', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => updatePurchaseOrder(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Purchase order updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update purchase order', 'error'),
  })

  const openCreate = () => {
    setEditingPO(null)
    setForm(emptyPOForm)
    setModalOpen(true)
  }

  const openEdit = (po) => {
    setEditingPO(po)
    // The PO list contract only guarantees `vendorName`, not `vendorId` — fall
    // back to matching the vendor by name against the vendors list so the
    // select can still be pre-populated when the backend omits the id.
    const resolvedVendorId =
      po.vendorId || vendors.find((v) => v.name === po.vendorName)?._id || vendors.find((v) => v.name === po.vendorName)?.id || ''
    setForm({
      vendorId: resolvedVendorId,
      items: (po.items || []).map((it) => ({
        inventoryItemId: it.inventoryItemId || '',
        qty: it.qty ?? '',
        unitCost: it.unitCost ?? '',
      })),
      expectedAt: po.expectedAt ? String(po.expectedAt).slice(0, 10) : '',
      note: po.note || '',
    })
    setDetailId(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingPO(null)
    setForm(emptyPOForm)
  }

  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, { ...emptyLine }] }))
  const updateLine = (idx, field, value) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((line, i) => (i === idx ? { ...line, [field]: value } : line)),
    }))
  const removeLine = (idx) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const subtotal = form.items.reduce(
    (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
    0,
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      vendorId: form.vendorId,
      items: form.items
        .filter((l) => l.inventoryItemId)
        .map((l) => ({
          inventoryItemId: l.inventoryItemId,
          qty: Number(l.qty) || 0,
          unitCost: Number(l.unitCost) || 0,
        })),
      ...(form.expectedAt ? { expectedAt: form.expectedAt } : {}),
      ...(form.note ? { note: form.note } : {}),
    }
    if (editingPO) {
      updateMutation.mutate({ id: editingPO._id || editingPO.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div>
      <div className="toolbar-spread">
        <div className="category-chips">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s.value}
              className={`chip ${statusFilter === s.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New PO
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading purchase orders…" />
        ) : pos.length === 0 ? (
          <EmptyState title="No purchase orders found" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>Created</th>
                <th>Expected</th>
                <th>Subtotal</th>
                <th>Status</th>
                {showBranchColumn && <th>Branch</th>}
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr
                  key={po._id || po.id}
                  className="table-row-clickable"
                  onClick={() => setDetailId(po._id || po.id)}
                >
                  <td>{po.poNumber}</td>
                  <td>{po.vendorName || '—'}</td>
                  <td>{formatDateTime(po.createdAt)}</td>
                  <td>{po.expectedAt ? formatDate(po.expectedAt) : '—'}</td>
                  <td>{formatCurrency(po.subtotal)}</td>
                  <td>
                    <StatusPill status={po.status} />
                  </td>
                  {showBranchColumn && <td>{branchName(po.branchId)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingPO ? `Edit ${editingPO.poNumber}` : 'New Purchase Order'}
        width="640px"
      >
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Vendor</span>
            <select
              required
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
            >
              <option value="">Select vendor…</option>
              {vendors.map((v) => (
                <option key={v._id || v.id} value={v._id || v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <span className="field-label">Items</span>
          <div className="po-line-rows">
            {form.items.map((line, idx) => {
              const lineTotal = (Number(line.qty) || 0) * (Number(line.unitCost) || 0)
              return (
                <div className="po-line-row" key={idx}>
                  <select
                    value={line.inventoryItemId}
                    onChange={(e) => updateLine(idx, 'inventoryItemId', e.target.value)}
                  >
                    <option value="">Select item…</option>
                    {inventoryItems.map((it) => (
                      <option key={it._id || it.id} value={it._id || it.id}>
                        {it.name} ({it.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Qty"
                    value={line.qty}
                    onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit cost"
                    value={line.unitCost}
                    onChange={(e) => updateLine(idx, 'unitCost', e.target.value)}
                  />
                  <span className="po-line-total">{formatCurrency(lineTotal)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-danger-text"
                    onClick={() => removeLine(idx)}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm modifier-add-btn" onClick={addLine}>
            + Add line
          </button>

          <p className="page-subtitle">
            Subtotal: <strong>{formatCurrency(subtotal)}</strong>
          </p>

          <div className="field-row">
            <label className="field">
              <span>Expected Date</span>
              <input
                type="date"
                value={form.expectedAt}
                onChange={(e) => setForm({ ...form, expectedAt: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>Note</span>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
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
              {editingPO ? 'Save' : 'Create Draft'}
            </button>
          </div>
        </form>
      </Modal>

      <PODetailModal po={selectedPO} onClose={() => setDetailId(null)} onEdit={openEdit} />
    </div>
  )
}

function PODetailModal({ po, onClose, onEdit }) {
  const queryClient = useQueryClient()
  const [receiveMode, setReceiveMode] = useState(false)
  const [receiveLines, setReceiveLines] = useState([])
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })

  const placeMutation = useMutation({
    mutationFn: placePurchaseOrder,
    onSuccess: () => {
      invalidate()
      toast('Purchase order placed', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to place purchase order', 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelPurchaseOrder,
    onSuccess: () => {
      invalidate()
      toast('Purchase order cancelled', 'success')
      setCancelConfirmOpen(false)
      onClose()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to cancel purchase order', 'error'),
  })

  const receiveMutation = useMutation({
    mutationFn: ({ id, data }) => receivePurchaseOrder(id, data),
    onSuccess: () => {
      invalidate()
      toast('Stock received', 'success')
      setReceiveMode(false)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to receive stock', 'error'),
  })

  const startReceive = () => {
    setReceiveLines(
      (po?.items || []).map((it) => ({
        itemId: it._id || it.id,
        remaining: (Number(it.qty) || 0) - (Number(it.receivedQty) || 0),
        qty: Math.max(0, (Number(it.qty) || 0) - (Number(it.receivedQty) || 0)),
        unitCost: it.unitCost ?? '',
        name: it.name,
        unit: it.unit,
      })),
    )
    setReceiveMode(true)
  }

  const updateReceiveLine = (idx, field, value) =>
    setReceiveLines((lines) => lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))

  const submitReceive = () => {
    const items = receiveLines
      .filter((l) => Number(l.qty) > 0)
      .map((l) => ({
        itemId: l.itemId,
        qty: Number(l.qty),
        ...(l.unitCost !== '' && l.unitCost != null ? { unitCost: Number(l.unitCost) } : {}),
      }))
    if (items.length === 0) {
      toast('Enter a quantity to receive', 'error')
      return
    }
    receiveMutation.mutate({ id: po._id || po.id, data: { items } })
  }

  if (!po) return null

  const canPlace = po.status === 'DRAFT'
  const canCancel = po.status === 'DRAFT' || po.status === 'PLACED'
  const canReceive = po.status === 'PLACED' || po.status === 'PARTIALLY_RECEIVED'

  return (
    <Modal open={!!po} onClose={onClose} title={po.poNumber} width="720px">
      <p className="customer-detail-meta">
        {po.vendorName} · <StatusPill status={po.status} />
      </p>
      {po.note && <p className="page-subtitle">{po.note}</p>}

      {!receiveMode ? (
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Unit</th>
              <th>Ordered</th>
              <th>Unit Cost</th>
              <th>Received</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(po.items || []).map((it) => (
              <tr key={it._id || it.inventoryItemId}>
                <td>{it.name}</td>
                <td>{it.unit}</td>
                <td>{it.qty}</td>
                <td>{formatCurrency(it.unitCost)}</td>
                <td>{it.receivedQty ?? 0}</td>
                <td>{formatCurrency((Number(it.qty) || 0) * (Number(it.unitCost) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th>Remaining</th>
                <th>Receive Now</th>
                <th>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {receiveLines.map((l, idx) => (
                <tr key={l.itemId} className="po-receive-row">
                  <td>{l.name}</td>
                  <td>{l.unit}</td>
                  <td>{l.remaining}</td>
                  <td>
                    <input
                      className="po-receive-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.qty}
                      onChange={(e) => updateReceiveLine(idx, 'qty', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="po-receive-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) => updateReceiveLine(idx, 'unitCost', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setReceiveMode(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={receiveMutation.isPending}
              onClick={submitReceive}
            >
              {receiveMutation.isPending ? 'Receiving…' : 'Confirm Receipt'}
            </button>
          </div>
        </>
      )}

      {!receiveMode && (
        <div className="modal-actions">
          {canPlace && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onEdit(po)}
            >
              Edit
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel PO
            </button>
          )}
          {canPlace && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={placeMutation.isPending}
              onClick={() => placeMutation.mutate(po._id || po.id)}
            >
              {placeMutation.isPending ? 'Placing…' : 'Place Order'}
            </button>
          )}
          {canReceive && (
            <button type="button" className="btn btn-primary" onClick={startReceive}>
              Receive
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel Purchase Order"
        message={`Cancel ${po.poNumber}? This cannot be undone.`}
        confirmLabel="Cancel PO"
        danger
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => cancelMutation.mutate(po._id || po.id)}
      />
    </Modal>
  )
}
