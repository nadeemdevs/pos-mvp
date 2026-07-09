export default function Spinner({ size = 24, label }) {
  return (
    <div className="spinner-wrap">
      <div
        className="spinner"
        style={{ width: size, height: size, borderWidth: Math.max(2, size / 8) }}
      />
      {label && <span className="spinner-label">{label}</span>}
    </div>
  )
}
