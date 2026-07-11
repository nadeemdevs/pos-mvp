const Invoice = require('../billing/invoice.model');
const Order = require('../orders/order.model');
const MenuItem = require('../menu/menuItem.model');
const InventoryItem = require('../inventory/inventoryItem.model');

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Same local-timezone day-boundary convention as reports.controller.localDay
// (business dates, not UTC — otherwise sales before ~5:30am IST land on the
// previous day's report).
function localDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

function todayStr() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Defaults both `from` and `to` to today when omitted, per spec.
function dayRange(from, to) {
  const fromDate = from || todayStr();
  const toDate = to || fromDate;
  return { start: localDay(fromDate).start, end: localDay(toDate).end };
}

// Pure, DB-free — unit tested directly (analytics.service.test.js). `menuItem`
// may be null/undefined (an invoice line with no menuItemId, e.g. a
// synthetic split-bill share) or have an empty recipe — both contribute 0.
function foodCostForLine(menuItem, qty, inventoryItemsById) {
  if (!menuItem || !menuItem.recipe || !menuItem.recipe.length) return 0;

  let cost = 0;
  for (const line of menuItem.recipe) {
    const invItem = inventoryItemsById.get(String(line.inventoryItemId));
    const avgCost = invItem ? invItem.avgCost || 0 : 0;
    cost += line.qty * avgCost * qty;
  }
  return cost;
}

// Batch-loads every distinct MenuItem (with its recipe) and every distinct
// InventoryItem referenced by those recipes, ONE query each — rather than a
// query per invoice-line — so foodCost computation over a whole day's
// invoices stays O(distinct items), not O(invoice lines).
async function loadMenuAndInventoryMaps(menuItemIds) {
  const ids = [...new Set(menuItemIds.map(String))].filter(Boolean);
  const menuItems = ids.length ? await MenuItem.find({ _id: { $in: ids } }).lean() : [];
  const menuItemsById = new Map(menuItems.map((m) => [String(m._id), m]));

  const inventoryIds = new Set();
  for (const m of menuItems) {
    for (const line of m.recipe || []) inventoryIds.add(String(line.inventoryItemId));
  }
  const inventoryItems = inventoryIds.size
    ? await InventoryItem.find({ _id: { $in: [...inventoryIds] } }).lean()
    : [];
  const inventoryItemsById = new Map(inventoryItems.map((i) => [String(i._id), i]));

  return { menuItemsById, inventoryItemsById };
}

// PAID invoices only, CANCELLED excluded — the baseline filter every
// analytics endpoint (except inventory-value, which isn't invoice-based)
// shares.
async function getInvoicesInRange(from, to, { skipBranchScope = false } = {}) {
  const { start, end } = dayRange(from, to);
  const query = Invoice.find({
    paymentStatus: 'PAID',
    status: { $ne: 'CANCELLED' },
    createdAt: { $gte: start, $lte: end },
  });
  if (skipBranchScope) query.setOptions({ skipBranchScope: true });
  return query.lean();
}

async function overview(from, to) {
  const invoices = await getInvoicesInRange(from, to);

  const revenue = round2(invoices.reduce((sum, inv) => sum + inv.total, 0));
  const invoiceCount = invoices.length;
  const avgTicket = invoiceCount ? round2(revenue / invoiceCount) : 0;

  const menuItemIds = invoices.flatMap((inv) => inv.items.map((i) => i.menuItemId)).filter(Boolean);
  const { menuItemsById, inventoryItemsById } = await loadMenuAndInventoryMaps(menuItemIds);

  let foodCost = 0;
  for (const inv of invoices) {
    for (const item of inv.items) {
      const menuItem = item.menuItemId ? menuItemsById.get(String(item.menuItemId)) : null;
      foodCost += foodCostForLine(menuItem, item.qty, inventoryItemsById);
    }
  }
  foodCost = round2(foodCost);

  const grossProfit = round2(revenue - foodCost);
  const foodCostPct = revenue ? round2((foodCost / revenue) * 100) : 0;

  return { revenue, invoiceCount, avgTicket, foodCost, grossProfit, foodCostPct };
}

// Bucketed by the LOCAL hour (server timezone) of each invoice's createdAt —
// only hours with at least one invoice are returned, ascending.
async function peakHours(from, to) {
  const invoices = await getInvoicesInRange(from, to);
  const buckets = new Map();

  for (const inv of invoices) {
    const hour = new Date(inv.createdAt).getHours();
    const bucket = buckets.get(hour) || { hour, revenue: 0, count: 0 };
    bucket.revenue += inv.total;
    bucket.count += 1;
    buckets.set(hour, bucket);
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, revenue: round2(b.revenue) }))
    .sort((a, b) => a.hour - b.hour);
}

async function itemsProfitability(from, to) {
  const invoices = await getInvoicesInRange(from, to);

  const menuItemIds = invoices.flatMap((inv) => inv.items.map((i) => i.menuItemId)).filter(Boolean);
  const { menuItemsById, inventoryItemsById } = await loadMenuAndInventoryMaps(menuItemIds);

  const byItem = new Map(); // keyed by menuItemId, or `name:<name>` for lines with none

  for (const inv of invoices) {
    for (const item of inv.items) {
      const key = item.menuItemId ? String(item.menuItemId) : `name:${item.name}`;
      const entry = byItem.get(key) || { name: item.name, qty: 0, revenue: 0, foodCost: 0 };
      entry.qty += item.qty;
      entry.revenue += item.price * item.qty;
      const menuItem = item.menuItemId ? menuItemsById.get(String(item.menuItemId)) : null;
      entry.foodCost += foodCostForLine(menuItem, item.qty, inventoryItemsById);
      byItem.set(key, entry);
    }
  }

  return [...byItem.values()]
    .map((e) => {
      const revenue = round2(e.revenue);
      const foodCost = round2(e.foodCost);
      const margin = round2(revenue - foodCost);
      const marginPct = revenue ? round2((margin / revenue) * 100) : 0;
      return { name: e.name, qty: e.qty, revenue, foodCost, margin, marginPct };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// Groups by the *order's* channel (falls back to 'POS' for invoices with no
// orderId — Mode 1 counter sales). One extra query (batch-loaded orders),
// joined in JS rather than a $lookup aggregation — simpler and just as cheap
// at this data volume; documented as the "two queries" option from the spec.
async function channels(from, to) {
  const invoices = await getInvoicesInRange(from, to);

  const orderIds = invoices.filter((inv) => inv.orderId).map((inv) => inv.orderId);
  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } }).select('channel').lean()
    : [];
  const channelByOrderId = new Map(orders.map((o) => [String(o._id), o.channel || 'POS']));

  const byChannel = new Map();
  for (const inv of invoices) {
    const channel = inv.orderId ? channelByOrderId.get(String(inv.orderId)) || 'POS' : 'POS';
    const entry = byChannel.get(channel) || { channel, revenue: 0, count: 0 };
    entry.revenue += inv.total;
    entry.count += 1;
    byChannel.set(channel, entry);
  }

  return [...byChannel.values()].map((e) => ({ ...e, revenue: round2(e.revenue) }));
}

async function inventoryValue() {
  const items = await InventoryItem.find({ active: true }).lean();
  const rows = items.map((i) => ({
    name: i.name,
    currentStock: i.currentStock,
    avgCost: i.avgCost,
    value: round2((i.currentStock || 0) * (i.avgCost || 0)),
  }));
  const totalValue = round2(rows.reduce((sum, r) => sum + r.value, 0));
  return { items: rows, totalValue };
}

// Deliberately cross-branch (skipBranchScope) — this endpoint's entire
// purpose is comparing branches against each other, so it must NOT be
// silently narrowed to the caller's own branch by the tenantPlugin
// branch-scoping hooks (see common/database/tenantPlugin.js).
async function byBranch(from, to) {
  const invoices = await getInvoicesInRange(from, to, { skipBranchScope: true });

  const byBranchMap = new Map();
  for (const inv of invoices) {
    const branchId = inv.branchId || 'main';
    const entry = byBranchMap.get(branchId) || { branchId, revenue: 0, count: 0 };
    entry.revenue += inv.total;
    entry.count += 1;
    byBranchMap.set(branchId, entry);
  }

  return [...byBranchMap.values()].map((e) => ({ ...e, revenue: round2(e.revenue) }));
}

module.exports = {
  round2,
  localDay,
  dayRange,
  foodCostForLine,
  overview,
  peakHours,
  itemsProfitability,
  channels,
  inventoryValue,
  byBranch,
};
