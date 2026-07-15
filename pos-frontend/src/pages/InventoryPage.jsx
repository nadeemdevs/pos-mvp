import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  adjustInventoryItem,
  createInventoryItem,
  getInventoryItems,
  getInventoryLedger,
  updateInventoryItem,
} from '../services/inventoryService'
import { getBranches } from '../services/branchService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useSocketEvents } from '../hooks/useSocketEvents'
import { useBranchStore } from '../store/branchStore'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDateTime } from '../utils/format'

const UNIT_OPTIONS = ['g', 'kg', 'ml', 'l', 'pc']
const PAGE_SIZE = 20
const LEDGER_PAGE_SIZE = 20

const emptyForm = {
  name: '',
  sku: '',
  category: '',
  unit: 'g',
  minStock: '',
  openingStock: '',
  openingUnitCost: '',
}

const emptyAdjustForm = { type: 'ADJUSTMENT', sign: '+', qty: '', note: '' }

export default function InventoryPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const activeBranch = useBranchStore((s) => s.activeBranch)
  const showBranchColumn = activeBranch === 'all'

  // Only needed to resolve a branchId -> display name when showing the
  // combined "All Branches" list — a plain unfiltered side-by-side view, not
  // a merge/sum of rows.
  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => getBranches(),
    enabled: showBranchColumn,
    retry: false,
  })
  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.items || []
  const branchName = (code) => branches.find((b) => b.code === code)?.name || code || '—'

  const [searchInput, setSearchInput] = useState('')
  const [lowOnly, setLowOnly] = useState(searchParams.get('low') === '1')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const [adjustTarget, setAdjustTarget] = useState(null)
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm)

  const [ledgerItem, setLedgerItem] = useState(null)
  const [ledgerPage, setLedgerPage] = useState(1)

  const search = useDebouncedValue(searchInput, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { search, low: lowOnly, page }],
    queryFn: () =>
      getInventoryItems({
        ...(search ? { search } : {}),
        ...(lowOnly ? { low: true } : {}),
        page,
        limit: PAGE_SIZE,
      }),
  })
  const items = Array.isArray(data) ? data : data?.items || []
  const total = Array.isArray(data) ? items.length : data?.total ?? items.length
  const hasMore = page * PAGE_SIZE < total

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['inventory'] })

  useSocketEvents({
    'inventory.updated': invalidate,
    'stock.low': (payload) => {
      const name = payload?.name || payload?.item?.name || 'Item'
      const stock = payload?.stock ?? payload?.currentStock ?? payload?.item?.currentStock
      toast(`⚠ ${name} low: ${stock ?? '—'}`, 'error')
      invalidate()
    },
  })

  const createMutation = useMutation({
    mutationFn: async ({ openingStock, openingUnitCost, ...payload }) => {
      const created = await createInventoryItem(payload)
      const opening = Number(openingStock)
      const id = created?._id || created?.id
      if (opening && id) {
        await adjustInventoryItem(id, {
          qty: opening,
          type: 'ADJUSTMENT',
          note: 'Opening stock',
          unitCost: openingUnitCost ? Number(openingUnitCost) : undefined,
        })
      }
      return created
    },
    onSuccess: () => {
      invalidate()
      toast('Inventory item created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create item', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: patch }) => updateInventoryItem(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Inventory item updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update item', 'error'),
  })

  const adjustMutation = useMutation({
    mutationFn: ({ id, data: patch }) => adjustInventoryItem(id, patch),
    onSuccess: () => {
      invalidate()
      toast('Stock adjusted', 'success')
      closeAdjust()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to adjust stock', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      name: item.name || '',
      sku: item.sku || '',
      category: item.category || '',
      unit: item.unit || 'g',
      minStock: item.minStock ?? '',
      openingStock: '',
      openingUnitCost: '',
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
    const payload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      unit: form.unit,
      minStock: Number(form.minStock) || 0,
    }
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: payload })
    } else {
      createMutation.mutate({
        ...payload,
        openingStock: form.openingStock,
        openingUnitCost: form.openingUnitCost,
      })
    }
  }

  const toggleActive = (item) => {
    updateMutation.mutate({
      id: item._id || item.id,
      data: { active: item.active === false },
    })
  }

  const openAdjust = (item) => {
    setAdjustTarget(item)
    setAdjustForm(emptyAdjustForm)
  }

  const closeAdjust = () => {
    setAdjustTarget(null)
    setAdjustForm(emptyAdjustForm)
  }

  const handleTypeChange = (type) => {
    setAdjustForm((f) => ({ ...f, type, sign: type === 'WASTAGE' ? '-' : f.sign }))
  }

  const magnitude = Math.abs(Number(adjustForm.qty)) || 0
  const signedQty = adjustForm.sign === '-' ? -magnitude : magnitude
  const previewStock = Math.round(((adjustTarget?.currentStock ?? 0) + signedQty) * 10000) / 10000

  const handleAdjustSubmit = (e) => {
    e.preventDefault()
    if (!magnitude) {
      toast('Enter a quantity', 'error')
      return
    }
    if (adjustForm.type === 'WASTAGE' && !adjustForm.note.trim()) {
      toast('A note is required for wastage', 'error')
      return
    }
    adjustMutation.mutate({
      id: adjustTarget._id || adjustTarget.id,
      data: { qty: signedQty, type: adjustForm.type, note: adjustForm.note || undefined },
    })
  }

  const openLedger = (item) => {
    setLedgerItem(item)
    setLedgerPage(1)
  }

  const closeLedger = () => setLedgerItem(null)

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['inventory', 'ledger', ledgerItem?._id || ledgerItem?.id, ledgerPage],
    queryFn: () =>
      getInventoryLedger(ledgerItem._id || ledgerItem.id, {
        page: ledgerPage,
        limit: LEDGER_PAGE_SIZE,
      }),
    enabled: !!ledgerItem,
  })
  const ledgerEntries = Array.isArray(ledgerData) ? ledgerData : ledgerData?.items || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Track stock levels, adjustments, and wastage</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Item
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search by name or SKU…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setPage(1)
          }}
        />
        <button
          type="button"
          className={`chip ${lowOnly ? 'active' : ''}`}
          onClick={() => {
            setLowOnly((v) => !v)
            setPage(1)
          }}
        >
          Low stock
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading inventory…" />
        ) : items.length === 0 ? (
          <EmptyState title="No inventory items found" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Current Stock</th>
                  <th>Min Stock</th>
                  <th>Avg Cost</th>
                  <th>Status</th>
                  {showBranchColumn && <th>Branch</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const stock = Number(item.currentStock) || 0
                  const min = Number(item.minStock) || 0
                  const low = stock < min
                  const inactive = item.active === false
                  return (
                    <tr key={item._id || item.id}>
                      <td>{item.name}</td>
                      <td>{item.sku || '—'}</td>
                      <td>{item.category || '—'}</td>
                      <td>{item.unit}</td>
                      <td>
                        <span className={`badge ${low ? 'badge-danger' : 'badge-muted'}`}>
                          {stock}
                        </span>
                      </td>
                      <td>{min}</td>
                      <td>{formatCurrency(item.avgCost)}</td>
                      <td>
                        <span className={`badge ${inactive ? 'badge-muted' : 'badge-success'}`}>
                          {inactive ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      {showBranchColumn && <td>{branchName(item.branchId)}</td>}
                      <td className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openAdjust(item)}>
                          Adjust
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openLedger(item)}>
                          Ledger
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(item)}>
                          {inactive ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
        title={editing ? 'Edit Inventory Item' : 'New Inventory Item'}
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
              <span>SKU</span>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </label>
            <label className="field">
              <span>Category</span>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Unit</span>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Min Stock</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            </label>
          </div>

          {editing ? (
            <label className="field">
              <span>Current Stock (read-only)</span>
              <input value={editing.currentStock ?? 0} disabled readOnly />
            </label>
          ) : (
            <div className="field-row">
              <label className="field">
                <span>Opening Stock (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.openingStock}
                  onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Unit Cost</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.openingUnitCost}
                  onChange={(e) => setForm({ ...form, openingUnitCost: e.target.value })}
                />
              </label>
            </div>
          )}

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

      <Modal
        open={!!adjustTarget}
        onClose={closeAdjust}
        title={`Adjust Stock — ${adjustTarget?.name || ''}`}
        width="420px"
      >
        <form onSubmit={handleAdjustSubmit}>
          <label className="field">
            <span>Type</span>
            <select value={adjustForm.type} onChange={(e) => handleTypeChange(e.target.value)}>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="WASTAGE">Wastage</option>
            </select>
          </label>

          <span className="field-label">Direction</span>
          <div className="method-toggle">
            <button
              type="button"
              className={`toggle-btn ${adjustForm.sign === '+' ? 'active' : ''}`}
              onClick={() => setAdjustForm((f) => ({ ...f, sign: '+' }))}
            >
              + Add
            </button>
            <button
              type="button"
              className={`toggle-btn ${adjustForm.sign === '-' ? 'active' : ''}`}
              onClick={() => setAdjustForm((f) => ({ ...f, sign: '-' }))}
            >
              − Remove
            </button>
          </div>

          <label className="field">
            <span>Quantity ({adjustTarget?.unit})</span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              autoFocus
              value={adjustForm.qty}
              onChange={(e) => setAdjustForm((f) => ({ ...f, qty: e.target.value }))}
            />
          </label>

          <label className="field">
            <span>Note {adjustForm.type === 'WASTAGE' ? '(required)' : '(optional)'}</span>
            <textarea
              rows={2}
              required={adjustForm.type === 'WASTAGE'}
              value={adjustForm.note}
              onChange={(e) => setAdjustForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>

          <p className="page-subtitle">
            Resulting stock: <strong>{previewStock} {adjustTarget?.unit}</strong>
          </p>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={closeAdjust}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Saving…' : 'Save Adjustment'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!ledgerItem}
        onClose={closeLedger}
        title={`Ledger — ${ledgerItem?.name || ''}`}
        width="760px"
      >
        {ledgerLoading ? (
          <Spinner label="Loading ledger…" />
        ) : ledgerEntries.length === 0 ? (
          <EmptyState title="No ledger entries yet" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Balance After</th>
                  <th>Ref</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((entry, idx) => {
                  const qty = Number(entry.qty) || 0
                  return (
                    <tr key={entry._id || idx}>
                      <td>{formatDateTime(entry.createdAt || entry.at)}</td>
                      <td>{entry.type}</td>
                      <td className={qty > 0 ? 'ledger-qty-pos' : qty < 0 ? 'ledger-qty-neg' : ''}>
                        {qty > 0 ? `+${qty}` : qty}
                      </td>
                      <td>{entry.unitCost != null ? formatCurrency(entry.unitCost) : '—'}</td>
                      <td>{entry.balanceAfter ?? '—'}</td>
                      <td>
                        {entry.refType
                          ? `${entry.refType}${
                              entry.refId ? ' #' + String(entry.refId).slice(-6) : ''
                            }`
                          : '—'}
                      </td>
                      <td>{(typeof entry.by === 'object' ? entry.by?.name : entry.by) || '—'}</td>
                      <td title={entry.note || ''}>{entry.note || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="pagination-row">
              <button
                className="btn btn-ghost btn-sm"
                disabled={ledgerPage <= 1}
                onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pagination-label">Page {ledgerPage}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={ledgerEntries.length < LEDGER_PAGE_SIZE}
                onClick={() => setLedgerPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
