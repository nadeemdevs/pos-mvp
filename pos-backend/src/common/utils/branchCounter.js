// Shared helper for the daily sequence counters (order/invoice/kot/po/shift
// numbers) — Phase 5.3 branch hardening + Phase 6.1 tenant hardening. Each
// tenant+branch gets its own independently-numbered sequence. The
// pre-existing 'default' tenant / 'main' branch reality is kept
// byte-for-byte backward compatible: their counter keys and visible number
// formats are unchanged from before scoping existed. Any other tenant or
// branch gets both its Counter key AND its visible number prefixed —
// otherwise two tenants (or branches) would each mint "ORD-20260711-0001"
// on the same day and collide on the `orderNumber`/`invoiceNumber`/etc
// `unique: true` indexes (which remain GLOBAL).
const requestContext = require('../requestContext');

function currentBranchId() {
  const ctx = requestContext.get();
  return ctx && ctx.branchId ? ctx.branchId : 'main';
}

function currentTenantId() {
  const ctx = requestContext.get();
  return ctx && ctx.tenantId ? ctx.tenantId : 'default';
}

// Suffix appended to the Counter `key` — empty for 'default'/'main'
// (backward compat), `-<tenantId>`/`-<branchId>` otherwise. Tenant first,
// then branch: `invoice-20260711-test-bistro-b2`.
function counterKeySuffix() {
  const tenantId = currentTenantId();
  const branchId = currentBranchId();
  const tenantPart = tenantId === 'default' ? '' : `-${tenantId}`;
  const branchPart = branchId === 'main' ? '' : `-${branchId}`;
  return `${tenantPart}${branchPart}`;
}

// Prefix segment inserted into the human-readable number — empty for
// 'default'/'main', `<TENANTID>-`/`<BRANCHID>-` otherwise (uppercased
// purely for readability on receipts/KOTs).
function numberPrefix() {
  const tenantId = currentTenantId();
  const branchId = currentBranchId();
  const tenantPart = tenantId === 'default' ? '' : `${tenantId.toUpperCase()}-`;
  const branchPart = branchId === 'main' ? '' : `${branchId.toUpperCase()}-`;
  return `${tenantPart}${branchPart}`;
}

module.exports = { currentTenantId, currentBranchId, counterKeySuffix, numberPrefix };
