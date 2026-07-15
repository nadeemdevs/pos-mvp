import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'
import { regenerateTableQrToken } from '../services/tableService'
import { toast } from '../store/toastStore'

// Renders a scannable QR code linking to the public /qr/:qrToken ordering
// page for a single table. If the table has no token yet (first use) it
// silently regenerates one on open. Regenerating an existing token
// invalidates any link already printed/scanned, so that path is confirmed.
export default function QRModal({ table, onClose }) {
  const queryClient = useQueryClient()
  const canvasRef = useRef(null)
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const tableId = table?._id || table?.id
  const qrToken = table?.qrToken

  const regenMutation = useMutation({
    mutationFn: () => regenerateTableQrToken(tableId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      toast('QR code regenerated', 'success')
      setConfirmRegenOpen(false)
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to regenerate QR code', 'error'),
  })

  // First-use: table has no token yet — mint one automatically.
  useEffect(() => {
    if (table && !qrToken && !regenMutation.isPending) {
      regenMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, qrToken])

  const url = qrToken ? `${window.location.origin}/qr/${qrToken}` : ''

  useEffect(() => {
    if (url && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1 }, (err) => {
        if (err) toast('Failed to render QR code', 'error')
      })
    }
  }, [url])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast('Link copied', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  return (
    <Modal open={!!table} onClose={onClose} title={`QR Code — ${table?.name || ''}`} width="360px">
      <div className="qr-modal-body">
        {!qrToken ? (
          <p>Generating QR code…</p>
        ) : (
          <>
            <canvas ref={canvasRef} className="qr-modal-canvas" />
            <p className="qr-modal-url">{url}</p>
          </>
        )}

        <div className="modal-actions qr-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!url} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={regenMutation.isPending}
            onClick={() => setConfirmRegenOpen(true)}
          >
            Regenerate
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!qrToken} onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {qrToken && (
        <div className="printable-area qr-print-area">
          <h2>{table?.name}</h2>
          <canvas
            ref={(node) => {
              if (node && url) {
                QRCode.toCanvas(node, url, { width: 260, margin: 1 })
              }
            }}
          />
          <p>Scan to order</p>
        </div>
      )}

      <ConfirmDialog
        open={confirmRegenOpen}
        title="Regenerate QR Code"
        message="This invalidates the current QR code — any printed copies or saved links will stop working. Continue?"
        confirmLabel="Regenerate"
        danger
        onCancel={() => setConfirmRegenOpen(false)}
        onConfirm={() => regenMutation.mutate()}
      />
    </Modal>
  )
}
