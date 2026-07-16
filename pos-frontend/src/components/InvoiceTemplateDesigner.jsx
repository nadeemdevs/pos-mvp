import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVertical } from 'lucide-react'
import { getSettings, updateSettings } from '../services/settingsService'
import { toast } from '../store/toastStore'
import Spinner from './Spinner'
import Receipt from './Receipt'
import { DEFAULT_RECEIPT_TEMPLATE, resolveReceiptTemplate } from '../utils/receiptTemplate'

// Static sample bill for the live preview — numbers are internally consistent
// (subtotal 860 + tax 43 − discount 50 + roundOff 0 = 853).
const SAMPLE_INVOICE = {
  invoiceNumber: 'INV-1042',
  branchId: 'main',
  customer: { name: 'Asha', phone: '98765 43210' },
  items: [
    { name: 'Paneer Tikka', qty: 2, price: 250, taxRate: 5 },
    { name: 'Butter Naan', qty: 4, price: 60, taxRate: 5 },
    { name: 'Sweet Lassi', qty: 1, price: 120, taxRate: 5 },
  ],
  subtotal: 860,
  tax: 43,
  sgst: 21.5,
  cgst: 21.5,
  discount: 50,
  discountType: 'FLAT',
  discountValue: 50,
  roundOff: 0,
  total: 853,
}

const HEADER_TOGGLES = [
  { key: 'showRestaurantName', label: 'Restaurant name' },
  { key: 'showAddress', label: 'Address' },
  { key: 'showPhone', label: 'Phone' },
  { key: 'showEmail', label: 'Email' },
  { key: 'showWebsite', label: 'Website' },
  { key: 'showBranch', label: 'Branch' },
  { key: 'showGst', label: 'GST number' },
]

const TOTALS_TOGGLES = [
  { key: 'showSubtotal', label: 'Subtotal' },
  { key: 'showTax', label: 'Tax (SGST/CGST split when applicable)' },
  { key: 'showDiscount', label: 'Discount' },
  { key: 'showRoundOff', label: 'Round off' },
]

export default function InvoiceTemplateDesigner() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [draft, setDraft] = useState(DEFAULT_RECEIPT_TEMPLATE)

  useEffect(() => {
    if (settings) setDraft(resolveReceiptTemplate(settings.receiptTemplate))
  }, [settings])

  const mutation = useMutation({
    mutationFn: () => updateSettings({ receiptTemplate: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast('Invoice template saved', 'success')
    },
    onError: (e) => toast(e.response?.data?.message || 'Failed to save invoice template', 'error'),
  })

  const setHeader = (patch) => setDraft((d) => ({ ...d, header: { ...d.header, ...patch } }))
  const setTotals = (patch) => setDraft((d) => ({ ...d, totals: { ...d.totals, ...patch } }))
  const setFooter = (patch) => setDraft((d) => ({ ...d, footer: { ...d.footer, ...patch } }))

  const setColumn = (idx, patch) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))

  // Drag-to-reorder: dragIndex is the row being dragged, dragArmed gates the
  // HTML5 draggable attribute so drags can only start from the grip handle
  // (otherwise dragging would fight text selection in the label inputs).
  const [dragIndex, setDragIndex] = useState(null)
  const [dragArmed, setDragArmed] = useState(null)

  const moveColumnTo = (from, to) =>
    setDraft((d) => {
      const columns = [...d.columns]
      const [moved] = columns.splice(from, 1)
      columns.splice(to, 0, moved)
      return { ...d, columns }
    })

  const handleDragEnter = (idx) => {
    if (dragIndex === null || dragIndex === idx) return
    moveColumnTo(dragIndex, idx)
    setDragIndex(idx)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragArmed(null)
  }

  if (isLoading) return <Spinner label="Loading settings…" />

  const atLeastOneColumn = draft.columns.some((c) => c.visible)

  // Real invoices only carry an SGST/CGST split when the store is in India —
  // mirror that in the sample so the preview matches actual prints.
  const sampleInvoice =
    settings?.country === 'India' ? SAMPLE_INVOICE : { ...SAMPLE_INVOICE, sgst: 0, cgst: 0 }

  return (
    <div className="invoice-designer">
      <div className="card settings-form invoice-designer-controls">
        <div className="page-header">
          <h2>Invoice Template</h2>
          <button
            type="button"
            className="btn btn-primary"
            disabled={mutation.isPending || !atLeastOneColumn}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save Template'}
          </button>
        </div>
        <p className="page-subtitle">
          Design how printed bills and receipts look. Changes apply to all future prints; the font
          is fixed to the thermal-printer standard (Courier New).
        </p>

        <div className="settings-section-panel">
          <div className="settings-section-header">
            <h3>Paper</h3>
          </div>
          <label className="field">
            <span>Paper size</span>
            <select
              value={draft.paperWidth}
              onChange={(e) => setDraft((d) => ({ ...d, paperWidth: Number(e.target.value) }))}
            >
              <option value={80}>80 mm — standard receipt (~48 chars/line)</option>
              <option value={58}>58 mm — compact receipt (~32 chars/line)</option>
            </select>
          </label>
        </div>

        <div className="settings-section-panel">
          <div className="settings-section-header">
            <h3>Header</h3>
          </div>
          <p className="page-subtitle">
            Name, address, phone and other details come from General settings — toggle what
            appears on the bill.
          </p>
          <div className="invoice-designer-toggle-grid">
            {HEADER_TOGGLES.map(({ key, label }) => (
              <label key={key} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={!!draft.header[key]}
                  onChange={(e) => setHeader({ [key]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {draft.header.showGst && (
            <label className="field">
              <span>GST number (GSTIN)</span>
              <input
                placeholder="e.g. 29ABCDE1234F1Z5"
                value={draft.header.gstNumber}
                onChange={(e) => setHeader({ gstNumber: e.target.value })}
              />
            </label>
          )}
          <label className="field">
            <span>Custom header line (optional)</span>
            <input
              placeholder="e.g. FSSAI Lic No. 12345678901234"
              value={draft.header.customText}
              onChange={(e) => setHeader({ customText: e.target.value })}
            />
          </label>
        </div>

        <div className="settings-section-panel">
          <div className="settings-section-header">
            <h3>Item Columns</h3>
          </div>
          <p className="page-subtitle">Rename, reorder or hide the bill's item columns.</p>
          {!atLeastOneColumn && (
            <p className="discount-hint-error">At least one column must be visible.</p>
          )}
          <div className="invoice-designer-columns">
            {draft.columns.map((col, idx) => (
              <div
                key={col.key}
                className={
                  'invoice-designer-column-row' + (dragIndex === idx ? ' dragging' : '')
                }
                draggable={dragArmed === idx}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDragIndex(idx)
                }}
                onDragEnter={() => handleDragEnter(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
              >
                <span
                  className="invoice-designer-drag-handle"
                  title="Drag to reorder"
                  onMouseDown={() => setDragArmed(idx)}
                  onMouseUp={() => setDragArmed(null)}
                >
                  <GripVertical size={16} />
                </span>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={(e) => setColumn(idx, { visible: e.target.checked })}
                  />
                  <span className="invoice-designer-column-key">{col.key}</span>
                </label>
                <input
                  className="invoice-designer-column-label"
                  value={col.label}
                  placeholder="Column label"
                  onChange={(e) => setColumn(idx, { label: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section-panel">
          <div className="settings-section-header">
            <h3>Totals</h3>
          </div>
          <div className="invoice-designer-toggle-grid">
            {TOTALS_TOGGLES.map(({ key, label }) => (
              <label key={key} className="checkbox-field">
                <input
                  type="checkbox"
                  checked={!!draft.totals[key]}
                  onChange={(e) => setTotals({ [key]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>Grand total label</span>
            <input
              placeholder="Total"
              value={draft.totals.grandTotalLabel}
              onChange={(e) => setTotals({ grandTotalLabel: e.target.value })}
            />
          </label>
        </div>

        <div className="settings-section-panel">
          <div className="settings-section-header">
            <h3>Footer</h3>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={draft.footer.show}
              onChange={(e) => setFooter({ show: e.target.checked })}
            />
            <span>Show footer message</span>
          </label>
          {draft.footer.show && (
            <label className="field">
              <span>Footer message</span>
              <textarea
                rows={2}
                placeholder={settings?.receiptFooter || 'Thank you for visiting!'}
                value={draft.footer.text}
                onChange={(e) => setFooter({ text: e.target.value })}
              />
            </label>
          )}
        </div>
      </div>

      <div className="invoice-designer-preview">
        <div className="invoice-designer-preview-label">
          Live preview — {draft.paperWidth} mm paper
        </div>
        <div className="invoice-designer-preview-paper">
          <Receipt invoice={sampleInvoice} settings={settings} templateOverride={draft} />
        </div>
      </div>
    </div>
  )
}
