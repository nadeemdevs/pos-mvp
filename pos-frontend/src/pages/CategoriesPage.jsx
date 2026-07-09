import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '../services/categoryService'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'

const emptyForm = { name: '', sortOrder: 0 }

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const categories = Array.isArray(data) ? data : data?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] })

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      invalidate()
      toast('Category created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create category', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateCategory(id, data),
    onSuccess: () => {
      invalidate()
      toast('Category updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update category', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidate()
      toast('Category deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete category', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (category) => {
    setEditing(category)
    setForm({ name: category.name, sortOrder: category.sortOrder ?? 0 })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { name: form.name, sortOrder: Number(form.sortOrder) || 0 }
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
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Organize your menu into categories</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Category
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading categories…" />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories yet" message="Create your first category to get started." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sort Order</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories
                .slice()
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((c) => (
                  <tr key={c._id || c.id}>
                    <td>{c.name}</td>
                    <td>{c.sortOrder ?? 0}</td>
                    <td className="table-actions">
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
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit Category' : 'New Category'}
        width="420px"
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
            <span>Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
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
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />
    </div>
  )
}
