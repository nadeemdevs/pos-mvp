import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRole, deleteRole, getRoles, updateRole } from '../services/roleService'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'

const ALL_PERMISSIONS = [
  'billing.create',
  'billing.view',
  'customers.manage',
  'menu.manage',
  'reports.view',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'payments.take',
  'tables.manage',
  'orders.take',
  'kitchen.view',
  'inventory.manage',
  'purchasing.manage',
  'branches.manage',
  'audit.view',
  'loyalty.manage',
  'reservations.manage',
  'shifts.manage',
  'analytics.view',
]

const PERMISSION_LABELS = {
  'tables.manage': 'Manage Tables (create/edit tables, zones)',
  'orders.take': 'Take Orders (waiter — dine-in ordering)',
  'kitchen.view': 'Kitchen Display (view/update KOTs)',
  'inventory.manage': 'Manage Inventory (items, stock adjustments, ledger)',
  'purchasing.manage': 'Manage Purchasing (vendors, purchase orders)',
  'branches.manage': 'Manage Branches',
  'audit.view': 'View Audit Log',
  'loyalty.manage': 'Manage Loyalty (adjust customer points)',
  'reservations.manage': 'Manage Reservations (book, seat, cancel)',
  'shifts.manage': 'Manage Shifts (open/close, cash reconciliation)',
  'analytics.view': 'View Analytics (revenue, profitability, channels)',
}

const emptyForm = { name: '', permissions: [] }

export default function RolesPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['roles'], queryFn: getRoles })
  const roles = Array.isArray(data) ? data : data?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] })

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      invalidate()
      toast('Role created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create role', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRole(id, data),
    onSuccess: () => {
      invalidate()
      toast('Role updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update role', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      invalidate()
      toast('Role deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete role', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (role) => {
    setEditing(role)
    setForm({ name: role.name, permissions: role.permissions || [] })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const togglePermission = (perm) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }))
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
          <h1 className="page-title">Roles</h1>
          <p className="page-subtitle">Define permission sets for staff</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New Role
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading roles…" />
        ) : roles.length === 0 ? (
          <EmptyState title="No roles yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Permissions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r._id || r.id}>
                  <td>{r.name}</td>
                  <td>
                    {r.name === 'Admin' ? (
                      <span className="badge badge-success">All permissions</span>
                    ) : (
                      (r.permissions || []).map((p) => (
                        <span key={p} className="badge badge-muted">
                          {p}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => setDeleteTarget(r)}
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
        title={editing ? 'Edit Role' : 'New Role'}
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
          <span className="field-label">Permissions</span>
          <div className="permission-grid">
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.permissions.includes(perm)}
                  onChange={() => togglePermission(perm)}
                />
                <span>{PERMISSION_LABELS[perm] || perm}</span>
              </label>
            ))}
          </div>
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
        title="Delete Role"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />
    </div>
  )
}
