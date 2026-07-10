import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCategories } from '../services/categoryService'
import {
  createMenuItem,
  deleteMenuItem,
  getMenuItems,
  updateMenuItem,
} from '../services/menuService'
import { getInventoryItems } from '../services/inventoryService'
import { getSettings } from '../services/settingsService'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'
import { formatCurrency } from '../utils/format'

const emptyForm = {
  categoryId: '',
  name: '',
  sku: '',
  price: '',
  taxRate: '',
  active: true,
  modifiers: [],
  recipe: [],
}

export default function MenuPage() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData?.items || []

  // Recipes are a Phase 5 feature — gated behind settings.features.inventory,
  // same as the Inventory/Purchasing nav links.
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  })
  const inventoryEnabled = !!settingsData?.features?.inventory

  const { data: inventoryOptionsData } = useQuery({
    queryKey: ['inventory', 'recipe-options'],
    queryFn: () => getInventoryItems({ limit: 100 }),
    enabled: inventoryEnabled,
  })
  const inventoryOptions = Array.isArray(inventoryOptionsData)
    ? inventoryOptionsData
    : inventoryOptionsData?.items || []

  const { data, isLoading } = useQuery({
    queryKey: ['menu', { category: categoryFilter, search }],
    queryFn: () =>
      getMenuItems({
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(search ? { search } : {}),
      }),
  })
  const menuItems = Array.isArray(data) ? data : data?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['menu'] })

  const createMutation = useMutation({
    mutationFn: createMenuItem,
    onSuccess: () => {
      invalidate()
      toast('Menu item created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create item', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateMenuItem(id, data),
    onSuccess: () => {
      invalidate()
      toast('Menu item updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update item', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMenuItem,
    onSuccess: () => {
      invalidate()
      toast('Menu item deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete item', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({
      categoryId: item.categoryId || '',
      name: item.name || '',
      sku: item.sku || '',
      price: item.price ?? '',
      taxRate: item.taxRate ?? '',
      active: item.active ?? true,
      modifiers: Array.isArray(item.modifiers) ? item.modifiers.map((m) => ({ ...m })) : [],
      recipe: Array.isArray(item.recipe) ? item.recipe.map((r) => ({ ...r })) : [],
    })
    setModalOpen(true)
  }

  const addModifierRow = () => {
    setForm((f) => ({ ...f, modifiers: [...f.modifiers, { name: '', price: 0 }] }))
  }

  const updateModifierRow = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      modifiers: f.modifiers.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    }))
  }

  const removeModifierRow = (idx) => {
    setForm((f) => ({ ...f, modifiers: f.modifiers.filter((_, i) => i !== idx) }))
  }

  const addRecipeRow = () => {
    setForm((f) => ({ ...f, recipe: [...f.recipe, { inventoryItemId: '', qty: '', unit: '' }] }))
  }

  const updateRecipeRow = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      recipe: f.recipe.map((r, i) => {
        if (i !== idx) return r
        if (field === 'inventoryItemId') {
          const invItem = inventoryOptions.find((opt) => (opt._id || opt.id) === value)
          return { ...r, inventoryItemId: value, unit: invItem?.unit || '' }
        }
        return { ...r, [field]: value }
      }),
    }))
  }

  const removeRecipeRow = (idx) => {
    setForm((f) => ({ ...f, recipe: f.recipe.filter((_, i) => i !== idx) }))
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = {
      categoryId: form.categoryId || null,
      name: form.name,
      sku: form.sku,
      price: Number(form.price) || 0,
      taxRate: Number(form.taxRate) || 0,
      active: !!form.active,
      modifiers: form.modifiers
        .filter((m) => m.name.trim())
        .map((m) => ({ name: m.name.trim(), price: Number(m.price) || 0 })),
      ...(inventoryEnabled
        ? {
            recipe: form.recipe
              .filter((r) => r.inventoryItemId)
              .map((r) => ({
                inventoryItemId: r.inventoryItemId,
                qty: Number(r.qty) || 0,
                unit: r.unit,
              })),
          }
        : {}),
    }
    if (editing) {
      updateMutation.mutate({ id: editing._id || editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const toggleActive = (item) => {
    updateMutation.mutate({
      id: item._id || item.id,
      data: { active: !item.active },
    })
  }

  const categoryName = (id) =>
    categories.find((c) => (c._id || c.id) === id)?.name || '—'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Menu Items</h1>
          <p className="page-subtitle">Manage your menu catalogue</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Item
        </button>
      </div>

      <div className="toolbar">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c._id || c.id} value={c._id || c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Search menu items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading menu…" />
        ) : menuItems.length === 0 ? (
          <EmptyState title="No menu items found" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Tax %</th>
                <th>Modifiers</th>
                {inventoryEnabled && <th>Recipe</th>}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((item) => (
                <tr key={item._id || item.id}>
                  <td>{item.name}</td>
                  <td>{categoryName(item.categoryId)}</td>
                  <td>{item.sku}</td>
                  <td>{formatCurrency(item.price)}</td>
                  <td>{item.taxRate ?? 0}%</td>
                  <td>
                    {Array.isArray(item.modifiers) && item.modifiers.length > 0 ? (
                      <span className="badge badge-muted">{item.modifiers.length} modifiers</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {inventoryEnabled && (
                    <td>
                      {Array.isArray(item.recipe) && item.recipe.length > 0 ? (
                        <span className="badge badge-info">{item.recipe.length} ingredients</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td>
                    <span className={`badge ${item.active ? 'badge-success' : 'badge-muted'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(item)}>
                      {item.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => setDeleteTarget(item)}
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
        title={editing ? 'Edit Menu Item' : 'New Menu Item'}
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
          <label className="field">
            <span>Category</span>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>SKU</span>
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Price</span>
              <input
                type="number"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Tax %</span>
              <input
                type="number"
                step="0.01"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
              />
            </label>
          </div>

          <span className="field-label">Modifiers</span>
          <div className="modifier-editor-rows">
            {form.modifiers.map((m, idx) => (
              <div className="modifier-editor-row" key={idx}>
                <input
                  placeholder="Name (e.g. Extra Cheese)"
                  value={m.name}
                  onChange={(e) => updateModifierRow(idx, 'name', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={m.price}
                  onChange={(e) => updateModifierRow(idx, 'price', Number(e.target.value) || 0)}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-danger-text"
                  onClick={() => removeModifierRow(idx)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm modifier-add-btn" onClick={addModifierRow}>
            + Add modifier
          </button>

          {inventoryEnabled && (
            <>
              <span className="field-label">Recipe</span>
              <div className="modifier-editor-rows">
                {form.recipe.map((r, idx) => (
                  <div className="recipe-editor-row" key={idx}>
                    <select
                      value={r.inventoryItemId}
                      onChange={(e) => updateRecipeRow(idx, 'inventoryItemId', e.target.value)}
                    >
                      <option value="">Select ingredient…</option>
                      {inventoryOptions.map((opt) => (
                        <option key={opt._id || opt.id} value={opt._id || opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Qty"
                      value={r.qty}
                      onChange={(e) => updateRecipeRow(idx, 'qty', e.target.value)}
                    />
                    <span className="recipe-unit-label">{r.unit || '—'}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => removeRecipeRow(idx)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm modifier-add-btn"
                onClick={addRecipeRow}
              >
                + Add ingredient
              </button>
            </>
          )}

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
        title="Delete Menu Item"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />
    </div>
  )
}
