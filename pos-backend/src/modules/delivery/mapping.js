const MenuItem = require('../menu/menuItem.model');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pure matcher — sku first (exact), then name (case-insensitive exact) as a
// fallback. `menuItems` is a plain array of already-fetched active menu
// items (not a DB call), so this is unit-testable with a fixture list.
function matchInList(menuItems, reqItem) {
  if (reqItem.sku) {
    const bySku = menuItems.find((m) => m.sku && m.sku === reqItem.sku);
    if (bySku) return bySku;
  }
  if (reqItem.name) {
    const lower = String(reqItem.name).trim().toLowerCase();
    const byName = menuItems.find((m) => String(m.name).trim().toLowerCase() === lower);
    if (byName) return byName;
  }
  return null;
}

// Pure — no DB access. Returns { lines, unmatched }: `lines` are Order.items-
// shaped objects ready to embed on a new delivery Order (never trusting a
// partner-supplied price — only the matched MenuItem's own price/taxRate are
// used); `unmatched` is a list of human-readable labels for items that
// couldn't be matched against any menu item in `menuItems`.
function mapOrderItemsPure(menuItems, items = []) {
  const lines = [];
  const unmatched = [];

  for (const reqItem of items) {
    const menuItem = matchInList(menuItems, reqItem);
    if (!menuItem) {
      unmatched.push(reqItem.sku ? `${reqItem.name} (sku: ${reqItem.sku})` : reqItem.name);
      continue;
    }

    lines.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      price: menuItem.price,
      taxRate: menuItem.taxRate || 0,
      qty: reqItem.qty || 1,
      modifiers: [],
      note: reqItem.note || '',
      kotId: null,
    });
  }

  return { lines, unmatched };
}

// DB-backed entry point used by DeliveryProvider.mapOrder — one bulk fetch of
// every active menu item (a restaurant's menu is small; this beats N queries,
// one per partner line item), then delegates to the pure matcher above.
async function mapOrderItems(items = []) {
  const menuItems = await MenuItem.find({ active: true }).lean();
  return mapOrderItemsPure(menuItems, items);
}

module.exports = { mapOrderItems, mapOrderItemsPure, matchInList, escapeRegex };
