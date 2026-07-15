// Shared YYYYMMDD key used by the daily sequence counters (invoice/order/kot
// numbers). Extracted out of invoiceNumber.js so order/kot numbering reuse
// the exact same date formatting instead of re-implementing it.
function todayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

module.exports = { todayKey };
