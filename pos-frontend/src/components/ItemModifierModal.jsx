import { useEffect, useState } from 'react'
import Modal from './Modal'
import { formatCurrency } from '../utils/format'

// Popover shown when a dine-in order item has modifiers configured — lets
// the waiter pick add-ons, add a kitchen note, and set the quantity before
// the line is added to the order.
export default function ItemModifierModal({ open, item, currency, onClose, onAdd }) {
  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (open) {
      setSelected([])
      setNote('')
      setQty(1)
    }
  }, [open, item])

  if (!item) return null

  const modifiers = Array.isArray(item.modifiers) ? item.modifiers : []

  const toggle = (mod) => {
    setSelected((prev) =>
      prev.some((m) => m.name === mod.name)
        ? prev.filter((m) => m.name !== mod.name)
        : [...prev, mod],
    )
  }

  const modifierTotal = selected.reduce((sum, m) => sum + (Number(m.price) || 0), 0)
  const unitPrice = (item.price || 0) + modifierTotal

  const handleAdd = () => {
    onAdd({
      menuItemId: item._id || item.id,
      qty,
      modifiers: selected.map((m) => ({ name: m.name, price: Number(m.price) || 0 })),
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={item.name} width="420px">
      <div className="modifier-list">
        {modifiers.map((mod) => (
          <label key={mod.name} className="modifier-row">
            <span className="modifier-row-check">
              <input
                type="checkbox"
                checked={selected.some((m) => m.name === mod.name)}
                onChange={() => toggle(mod)}
              />
              <span>{mod.name}</span>
            </span>
            <span className="modifier-row-price">
              +{formatCurrency(mod.price, currency)}
            </span>
          </label>
        ))}
      </div>

      <label className="field">
        <span>Note (optional)</span>
        <input
          placeholder="e.g. Less spicy"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="modifier-qty-row">
        <span>Quantity</span>
        <div className="cart-line-controls">
          <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span className="stepper-qty">{qty}</span>
          <button type="button" className="stepper-btn" onClick={() => setQty((q) => q + 1)}>
            +
          </button>
        </div>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleAdd}>
          Add · {formatCurrency(unitPrice * qty, currency)}
        </button>
      </div>
    </Modal>
  )
}
