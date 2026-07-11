// Shared helper for the daily sequence counters (order/invoice/kot/po/shift
// numbers) — Phase 5.3 branch hardening. Each branch gets its own
// independently-numbered sequence, keyed by branchId, so two branches don't
// race each other for the same day's sequence. 'main' (the pre-existing,
// single-branch reality) is kept byte-for-byte backward compatible: its
// counter key and visible number format are unchanged from before branch
// scoping existed. Any other branch gets both its Counter key AND its
// visible number prefixed with the branchId — otherwise two branches would
// each mint "ORD-20260711-0001" on the same day and collide on the
// `orderNumber`/`invoiceNumber`/etc `unique: true` index.
const requestContext = require('../requestContext');

function currentBranchId() {
  const ctx = requestContext.get();
  return ctx && ctx.branchId ? ctx.branchId : 'main';
}

// Suffix appended to the Counter `key` — empty for 'main' (backward compat),
// `-<branchId>` otherwise.
function counterKeySuffix() {
  const branchId = currentBranchId();
  return branchId === 'main' ? '' : `-${branchId}`;
}

// Prefix segment inserted into the human-readable number — empty for 'main',
// `<BRANCHID>-` otherwise (uppercased purely for readability on receipts/KOTs).
function numberPrefix() {
  const branchId = currentBranchId();
  return branchId === 'main' ? '' : `${branchId.toUpperCase()}-`;
}

module.exports = { currentBranchId, counterKeySuffix, numberPrefix };
