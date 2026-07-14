export function formatCurrency(amount, currency = 'INR') {
  const value = Number(amount) || 0
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `₹${value.toFixed(2)}`
  }
}

export function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

export function formatDateTime(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Client-side preview only — the server is the source of truth for the
// actual roundOff applied to an invoice. Used to show a live estimate in
// the cart totals before an invoice is created.
export function computeRoundOff(total, rounding) {
  const nearest = Number(rounding?.nearest) || 0
  if (!rounding?.enabled || nearest <= 0) {
    return { rounded: total, roundOff: 0 }
  }
  const rounded = Math.round(total / nearest) * nearest
  return { rounded, roundOff: Math.round((rounded - total) * 100) / 100 }
}

// GST-registered Indian businesses show tax as two equal halves (SGST +
// CGST) rather than one lump amount. sgst+cgst always adds up to exactly
// `tax` (rather than each being a bare tax/2) so rounding never leaves the
// totals a cent off. Used for live cart/order previews before an invoice
// exists — once an invoice is created, its own persisted sgst/cgst fields
// are the source of truth (see Receipt.jsx).
export function splitTax(tax) {
  const sgst = Math.round((tax / 2) * 100) / 100
  const cgst = Math.round((tax - sgst) * 100) / 100
  return { sgst, cgst }
}

export function todayStr() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
