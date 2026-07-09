export default function Modal({ open, onClose, title, children, width }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-box"
        style={width ? { maxWidth: width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
