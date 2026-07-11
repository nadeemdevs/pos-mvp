import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addShiftMovement,
  closeShift,
  getCurrentShift,
  getShift,
  getShifts,
  openShift,
} from '../services/shiftService'
import { toast } from '../store/toastStore'
import { formatCurrency, formatDateTime } from '../utils/format'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

function varianceClass(variance) {
  if (variance == null) return ''
  if (variance > 0) return 'variance-positive'
  if (variance < 0) return 'variance-negative'
  return 'variance-zero'
}

function OpenShiftModal({ open, onClose, onSubmit, isSubmitting }) {
  const [openingFloat, setOpeningFloat] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="Open Shift" width="360px">
      <label className="field">
        <span>Opening float</span>
        <input
          type="number"
          min="0"
          step="0.01"
          autoFocus
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
        />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isSubmitting}
          onClick={() => onSubmit(Number(openingFloat) || 0)}
        >
          {isSubmitting ? 'Opening…' : 'Open Shift'}
        </button>
      </div>
    </Modal>
  )
}

function MovementModal({ open, onClose, onSubmit, isSubmitting }) {
  const [type, setType] = useState('IN')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="Cash Movement" width="360px">
      <div className="method-toggle">
        <button
          type="button"
          className={`toggle-btn ${type === 'IN' ? 'active' : ''}`}
          onClick={() => setType('IN')}
        >
          Cash In
        </button>
        <button
          type="button"
          className={`toggle-btn ${type === 'OUT' ? 'active' : ''}`}
          onClick={() => setType('OUT')}
        >
          Cash Out
        </button>
      </div>
      <label className="field">
        <span>Amount</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Reason</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!amount || isSubmitting}
          onClick={() => onSubmit({ type, amount: Number(amount) || 0, reason })}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

function CloseShiftModal({ open, onClose, expected, onSubmit, isSubmitting, result }) {
  const [declaredCash, setDeclaredCash] = useState('')
  const [note, setNote] = useState('')
  const variance = declaredCash !== '' ? Number(declaredCash) - (expected || 0) : null

  return (
    <Modal open={open} onClose={onClose} title="Close Shift" width="400px">
      {result ? (
        <div>
          <p>Shift closed.</p>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Expected</span>
              <span className="stat-value">{formatCurrency(result.expectedCash)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Declared</span>
              <span className="stat-value">{formatCurrency(result.declaredCash)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Variance</span>
              <span className={`stat-value ${varianceClass(result.variance)}`}>
                {result.variance > 0 ? '+' : ''}
                {formatCurrency(result.variance)}
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Expected in drawer</span>
              <span className="stat-value">{formatCurrency(expected)}</span>
            </div>
          </div>
          <label className="field">
            <span>Declared cash</span>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={declaredCash}
              onChange={(e) => setDeclaredCash(e.target.value)}
            />
          </label>
          {variance !== null && (
            <p className={variance === 0 ? '' : varianceClass(variance)}>
              Variance: {variance > 0 ? '+' : ''}
              {formatCurrency(variance)}
            </p>
          )}
          <label className="field">
            <span>Note (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={declaredCash === '' || isSubmitting}
              onClick={() => onSubmit({ declaredCash: Number(declaredCash) || 0, note })}
            >
              {isSubmitting ? 'Closing…' : 'Close Shift'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function ShiftDetailModal({ shiftId, onClose }) {
  const { data: shift, isLoading } = useQuery({
    queryKey: ['shifts', shiftId],
    queryFn: () => getShift(shiftId),
    enabled: !!shiftId,
  })
  const detail = shift?.shift || shift
  const movements = detail?.movements || []

  return (
    <Modal open={!!shiftId} onClose={onClose} title={`Shift ${detail?.shiftNumber || ''}`} width="520px">
      {isLoading ? (
        <Spinner label="Loading shift…" />
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Opening Float</span>
              <span className="stat-value">{formatCurrency(detail?.openingFloat)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Expected</span>
              <span className="stat-value">{formatCurrency(detail?.expectedCash)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Declared</span>
              <span className="stat-value">{formatCurrency(detail?.declaredCash)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Variance</span>
              <span className={`stat-value ${varianceClass(detail?.variance)}`}>
                {detail?.variance > 0 ? '+' : ''}
                {formatCurrency(detail?.variance)}
              </span>
            </div>
          </div>
          <h3>Movements</h3>
          {movements.length === 0 ? (
            <EmptyState title="No cash movements" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>At</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.type}</td>
                    <td>{formatCurrency(m.amount)}</td>
                    <td>{m.reason || '—'}</td>
                    <td>{formatDateTime(m.createdAt)}</td>
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

export default function ShiftsPage() {
  const queryClient = useQueryClient()
  const [openModalOpen, setOpenModalOpen] = useState(false)
  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeResult, setCloseResult] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [historyPage, setHistoryPage] = useState(1)
  const PAGE_SIZE = 20

  const { data: currentData, isLoading } = useQuery({
    queryKey: ['shifts', 'current'],
    queryFn: getCurrentShift,
    retry: false,
    refetchInterval: 15000,
  })
  const currentShift = currentData?.shift || (currentData?._id ? currentData : null)
  const cashSummary = currentData?.cashSummary

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['shifts', 'history', historyPage],
    queryFn: () => getShifts({ page: historyPage, limit: PAGE_SIZE }),
  })
  const history = Array.isArray(historyData) ? historyData : historyData?.items || []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['shifts'] })
  }

  const openMutation = useMutation({
    mutationFn: openShift,
    onSuccess: () => {
      invalidate()
      toast('Shift opened', 'success')
      setOpenModalOpen(false)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to open shift', 'error'),
  })

  const movementMutation = useMutation({
    mutationFn: (data) => addShiftMovement(currentShift._id || currentShift.id, data),
    onSuccess: () => {
      invalidate()
      toast('Cash movement recorded', 'success')
      setMovementModalOpen(false)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to record movement', 'error'),
  })

  const closeMutation = useMutation({
    mutationFn: (data) => closeShift(currentShift._id || currentShift.id, data),
    onSuccess: (result) => {
      invalidate()
      setCloseResult(result)
      toast('Shift closed', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to close shift', 'error'),
  })

  const closeCloseModal = () => {
    setCloseModalOpen(false)
    setCloseResult(null)
  }

  if (isLoading) return <Spinner label="Loading shift…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Shifts</h1>
          <p className="page-subtitle">Cash drawer reconciliation</p>
        </div>
      </div>

      <div className="card">
        {!currentShift ? (
          <EmptyState
            title="No open shift"
            message="Open a shift to start tracking cash movements."
            action={
              <button className="btn btn-primary" onClick={() => setOpenModalOpen(true)}>
                Open Shift
              </button>
            }
          />
        ) : (
          <>
            <div className="page-header">
              <div>
                <h2>Shift {currentShift.shiftNumber}</h2>
                <p className="page-subtitle">
                  Opened by {currentShift.openedBy?.name || currentShift.openedBy} at{' '}
                  {formatDateTime(currentShift.openedAt || currentShift.createdAt)}
                </p>
              </div>
              <div className="cart-header-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setMovementModalOpen(true)}>
                  Cash In/Out
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setCloseModalOpen(true)}>
                  Close Shift
                </button>
              </div>
            </div>
            <div className="stat-cards">
              <div className="stat-card">
                <span className="stat-label">Opening Float</span>
                <span className="stat-value">{formatCurrency(cashSummary?.openingFloat)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Cash Sales</span>
                <span className="stat-value">{formatCurrency(cashSummary?.cashSales)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Cash In</span>
                <span className="stat-value">{formatCurrency(cashSummary?.movementsIn)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Cash Out</span>
                <span className="stat-value">{formatCurrency(cashSummary?.movementsOut)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Expected in Drawer</span>
                <span className="stat-value">{formatCurrency(cashSummary?.expectedCash)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <h2>Shift History</h2>
      <div className="card">
        {historyLoading ? (
          <Spinner label="Loading history…" />
        ) : history.length === 0 ? (
          <EmptyState title="No past shifts" />
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Shift #</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th>Expected</th>
                  <th>Declared</th>
                  <th>Variance</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr
                    key={s._id || s.id}
                    className="table-row-clickable"
                    onClick={() => setDetailId(s._id || s.id)}
                  >
                    <td>{s.shiftNumber}</td>
                    <td>
                      {formatDateTime(s.openedAt)}
                      <br />
                      <span className="page-subtitle">{s.openedBy?.name || ''}</span>
                    </td>
                    <td>
                      {s.closedAt ? formatDateTime(s.closedAt) : '—'}
                      <br />
                      <span className="page-subtitle">{s.closedBy?.name || ''}</span>
                    </td>
                    <td>{formatCurrency(s.expectedCash)}</td>
                    <td>{formatCurrency(s.declaredCash)}</td>
                    <td className={varianceClass(s.variance)}>
                      {s.variance > 0 ? '+' : ''}
                      {formatCurrency(s.variance)}
                    </td>
                    <td>{s.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination-row">
              <button
                className="btn btn-ghost btn-sm"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="pagination-label">Page {historyPage}</span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={history.length < PAGE_SIZE}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      <OpenShiftModal
        open={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        onSubmit={(openingFloat) => openMutation.mutate({ openingFloat })}
        isSubmitting={openMutation.isPending}
      />

      <MovementModal
        open={movementModalOpen}
        onClose={() => setMovementModalOpen(false)}
        onSubmit={(data) => movementMutation.mutate(data)}
        isSubmitting={movementMutation.isPending}
      />

      <CloseShiftModal
        open={closeModalOpen}
        onClose={closeCloseModal}
        expected={cashSummary?.expectedCash}
        onSubmit={(data) => closeMutation.mutate(data)}
        isSubmitting={closeMutation.isPending}
        result={closeResult}
      />

      <ShiftDetailModal shiftId={detailId} onClose={() => setDetailId(null)} />
    </div>
  )
}
