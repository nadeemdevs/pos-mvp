import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, deleteUser, getUsers, updateUser } from '../services/userService'
import { getRoles } from '../services/roleService'
import { getBranches } from '../services/branchService'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { toast } from '../store/toastStore'

const emptyForm = { name: '', email: '', password: '', role: '', branchId: 'main' }

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const users = Array.isArray(data) ? data : data?.items || []

  const { data: rolesData } = useQuery({ queryKey: ['roles'], queryFn: getRoles })
  const roles = Array.isArray(rolesData) ? rolesData : rolesData?.items || []

  // Branch assignment — Admin-only form field, populated from the tenant's
  // active branches (single-branch tenants just get the implicit 'main').
  const { data: branchesData } = useQuery({ queryKey: ['branches'], queryFn: () => getBranches() })
  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.items || []
  const activeBranches = branches.filter((b) => b.active !== false)
  const branchName = (code) => activeBranches.find((b) => b.code === code)?.name || code || 'main'

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      invalidate()
      toast('User created', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to create user', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => {
      invalidate()
      toast('User updated', 'success')
      closeModal()
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to update user', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      invalidate()
      toast('User deleted', 'success')
      setDeleteTarget(null)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to delete user', 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setEditing(user)
    const roleId = typeof user.role === 'object' ? user.role?._id : user.role
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: roleId || '',
      branchId: user.branchId || 'main',
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
      const payload = { name: form.name, email: form.email, role: form.role, branchId: form.branchId }
      if (form.password) payload.password = form.password
      updateMutation.mutate({ id: editing._id || editing.id, data: payload })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Manage staff accounts</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + New User
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Spinner label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Branch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id || u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{typeof u.role === 'object' ? u.role?.name : u.role}</td>
                  <td>{branchName(u.branchId)}</td>
                  <td className="table-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger-text"
                      onClick={() => setDeleteTarget(u)}
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
        title={editing ? 'Edit User' : 'New User'}
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
            <span>Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{editing ? 'New Password (optional)' : 'Password'}</span>
            <input
              type="password"
              required={!editing}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="">Select role</option>
              {roles.map((r) => (
                <option key={r._id || r.id} value={r._id || r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Branch</span>
            <select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              {activeBranches.length === 0 && <option value="main">main</option>}
              {activeBranches.map((b) => (
                <option key={b._id || b.id || b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
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
        title="Delete User"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget._id || deleteTarget.id)}
      />
    </div>
  )
}
