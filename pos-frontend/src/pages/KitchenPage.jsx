import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getKots, printKot, updateKotStatus } from '../services/kotService'
import { useSocketEvents } from '../hooks/useSocketEvents'
import { toast } from '../store/toastStore'

const COLUMNS = [
  { status: 'NEW', title: 'Incoming', action: 'PREPARING', actionLabel: 'Start' },
  { status: 'PREPARING', title: 'Preparing', action: 'READY', actionLabel: 'Ready' },
  { status: 'READY', title: 'Ready', action: 'SERVED', actionLabel: 'Served' },
]

function useTicker() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])
}

function elapsedMMSS(dateStr) {
  if (!dateStr) return '--:--'
  const secs = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000))
  const mm = Math.floor(secs / 60)
  const ss = secs % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function KitchenTicketPrint({ payload }) {
  if (!payload) return null
  if (typeof payload === 'string') {
    return <pre className="kot-print-raw">{payload}</pre>
  }
  const items = Array.isArray(payload.items) ? payload.items : []
  return (
    <div className="kot-print-ticket">
      <div className="kot-print-header">{payload.kotNumber || 'KOT'}</div>
      <div className="kot-print-sub">{payload.tableName}</div>
      <div className="kot-print-divider" />
      {items.map((it, idx) => (
        <div key={idx} className="kot-print-item">
          <div>
            {it.qty} × {it.name}
          </div>
          {(it.modifiers || []).map((m) => (
            <div key={m.name} className="kot-print-modifier">
              + {m.name}
            </div>
          ))}
          {it.note && <div className="kot-print-note">Note: {it.note}</div>}
        </div>
      ))}
    </div>
  )
}

function TicketCard({ kot, column, onAdvance, onCancel, onPrint, isAdvancing }) {
  useTicker()
  const items = kot.items || []

  return (
    <div className="kot-ticket">
      <div className="kot-ticket-header">
        <span className="kot-ticket-number">{kot.kotNumber}</span>
        <span className="kot-ticket-elapsed">{elapsedMMSS(kot.createdAt)}</span>
      </div>
      <div className="kot-ticket-table">{kot.tableName}</div>
      <div className="kot-ticket-items">
        {items.map((it, idx) => (
          <div key={idx} className="kot-ticket-item">
            <span className="kot-ticket-item-qty">{it.qty}×</span>
            <span className="kot-ticket-item-name">{it.name}</span>
            {(it.modifiers || []).map((m) => (
              <div key={m.name} className="kot-ticket-modifier">
                + {m.name}
              </div>
            ))}
            {it.note && <div className="kot-ticket-note">{it.note}</div>}
          </div>
        ))}
      </div>
      <div className="kot-ticket-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onPrint(kot)}>
          Print
        </button>
        {column.status === 'NEW' && (
          <button className="kot-ticket-cancel" onClick={() => onCancel(kot)}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary kot-ticket-advance"
          disabled={isAdvancing}
          onClick={() => onAdvance(kot, column.action)}
        >
          {column.actionLabel}
        </button>
      </div>
    </div>
  )
}

export default function KitchenPage() {
  const queryClient = useQueryClient()
  const [printPayload, setPrintPayload] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['kots', 'board'],
    queryFn: () => getKots({ statuses: 'NEW,PREPARING,READY' }),
    refetchInterval: 10000,
  })
  const kots = Array.isArray(data) ? data : data?.items || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['kots'] })

  useSocketEvents({
    'kot.created': invalidate,
    'kot.updated': invalidate,
    'kot.ready': invalidate,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateKotStatus(id, status),
    onSuccess: invalidate,
    onError: (e) => toast(e.response?.data?.message || 'Failed to update KOT', 'error'),
  })

  const printMutation = useMutation({
    mutationFn: (id) => printKot(id),
    onSuccess: (data) => {
      if (data?.printed) {
        toast('Sent to kitchen printer', 'success')
      } else if (data?.payload) {
        setPrintPayload(data.payload)
        setTimeout(() => window.print(), 60)
      }
    },
    onError: (e) => toast(e.response?.data?.message || 'Print failed', 'error'),
  })

  useEffect(() => {
    const clear = () => setPrintPayload(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  const columns = COLUMNS.map((col) => ({
    ...col,
    tickets: kots.filter((k) => k.status === col.status),
  }))

  return (
    <div className="kitchen-page">
      <div className="kitchen-board">
        {columns.map((col) => (
          <div key={col.status} className="kitchen-column">
            <div className="kitchen-column-header">
              <span>{col.title}</span>
              <span className="kitchen-column-count">{col.tickets.length}</span>
            </div>
            <div className="kitchen-column-body">
              {!isLoading && col.tickets.length === 0 && (
                <p className="kitchen-column-empty">No tickets</p>
              )}
              {col.tickets.map((kot) => (
                <TicketCard
                  key={kot._id || kot.id}
                  kot={kot}
                  column={col}
                  isAdvancing={statusMutation.isPending}
                  onAdvance={(k, status) => statusMutation.mutate({ id: k._id || k.id, status })}
                  onCancel={(k) => statusMutation.mutate({ id: k._id || k.id, status: 'CANCELLED' })}
                  onPrint={(k) => printMutation.mutate(k._id || k.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {printPayload && (
        <div className="printable-area">
          <KitchenTicketPrint payload={printPayload} />
        </div>
      )}
    </div>
  )
}
