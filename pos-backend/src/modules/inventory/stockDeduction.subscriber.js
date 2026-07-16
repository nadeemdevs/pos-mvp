const { subscribe } = require('../../common/eventBus');
const Order = require('../orders/order.model');
const Invoice = require('../billing/invoice.model');
const MenuItem = require('../menu/menuItem.model');
const inventoryService = require('./inventory.service');

// Idempotency guard: both Order and Invoice carry a `stockDeducted` flag
// (plain schema field, not part of the tenant plugin). The
// findOneAndUpdate({stockDeducted:{$ne:true}}, {$set:{stockDeducted:true}})
// call below atomically claims the right to deduct — a duplicate
// 'order.completed'/'invoice.paid' publish (e.g. a retried webhook) finds no
// matching document the second time and no-ops.
async function deductForItems(items, { refType, refId, note }) {
  for (const item of items) {
    if (!item.menuItemId) continue;

    // eslint-disable-next-line no-await-in-loop
    const menuItem = await MenuItem.findById(item.menuItemId);
    if (!menuItem || !menuItem.recipe || !menuItem.recipe.length) continue;

    for (const line of menuItem.recipe) {
      const qty = -(line.qty * item.qty);
      try {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.applyStockChange({
          itemId: line.inventoryItemId,
          type: 'CONSUMPTION',
          qty,
          refType,
          refId,
          note,
        });
      } catch (err) {
        // Deduction failures must never break the payment/order flow that
        // triggered them — log and move on to the next recipe line/item.
        console.error(`[stock] deduction failed for menuItem ${menuItem._id} (${refType} ${refId}):`, err.message);
      }
    }
  }
}

// Mirror of deductForItems, run when a refund gives stock back — same recipe
// lookup, but the positive of the original quantity, tagged as a RETURN
// (the closest existing StockTransaction type to "reversed consumption").
async function reverseForItems(items, { refType, refId, note }) {
  for (const item of items) {
    if (!item.menuItemId) continue;

    // eslint-disable-next-line no-await-in-loop
    const menuItem = await MenuItem.findById(item.menuItemId);
    if (!menuItem || !menuItem.recipe || !menuItem.recipe.length) continue;

    for (const line of menuItem.recipe) {
      const qty = line.qty * item.qty;
      try {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.applyStockChange({
          itemId: line.inventoryItemId,
          type: 'RETURN',
          qty,
          refType,
          refId,
          note,
        });
      } catch (err) {
        console.error(`[stock] reversal failed for menuItem ${menuItem._id} (${refType} ${refId}):`, err.message);
      }
    }
  }
}

async function handleOrderCompleted({ order } = {}) {
  if (!order || !order._id) return;

  try {
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, stockDeducted: { $ne: true } },
      { $set: { stockDeducted: true } },
      { new: true }
    );
    if (!claimed) return; // already deducted (or order not found) — no-op

    await deductForItems(claimed.items, {
      refType: 'ORDER',
      refId: claimed._id,
      note: `Auto deduction for order ${claimed.orderNumber}`,
    });
  } catch (err) {
    console.error('[stock] order.completed handler failed:', err.message);
  }
}

// Counter sales (Mode 1) only — dine-in invoices (invoice.orderId set) are
// deducted via the order.completed path above instead, so double-deduction
// is avoided by construction (not just the stockDeducted flag).
async function handleInvoicePaid({ invoice } = {}) {
  if (!invoice || !invoice._id || invoice.orderId) return;

  try {
    const claimed = await Invoice.findOneAndUpdate(
      { _id: invoice._id, stockDeducted: { $ne: true } },
      { $set: { stockDeducted: true } },
      { new: true }
    );
    if (!claimed) return; // already deducted (or invoice not found) — no-op

    await deductForItems(claimed.items, {
      refType: 'INVOICE',
      refId: claimed._id,
      note: `Auto deduction for invoice ${claimed.invoiceNumber}`,
    });
  } catch (err) {
    console.error('[stock] invoice.paid handler failed:', err.message);
  }
}

// Counter sales only (mirrors handleInvoicePaid's orderId guard) — dine-in
// invoices never had their stock deducted via the Invoice path to begin
// with (see handleInvoicePaid above), so there's nothing to reverse here for
// them; a refunded dine-in invoice's stock is a known v1 limitation.
async function handleInvoiceRefunded({ invoice } = {}) {
  if (!invoice || !invoice._id || invoice.orderId || !invoice.stockDeducted) return;

  try {
    const claimed = await Invoice.findOneAndUpdate(
      { _id: invoice._id, stockReversed: { $ne: true } },
      { $set: { stockReversed: true } },
      { new: true }
    );
    if (!claimed) return; // already reversed — no-op

    await reverseForItems(claimed.items, {
      refType: 'INVOICE',
      refId: claimed._id,
      note: `Refund reversal for invoice ${claimed.invoiceNumber}`,
    });
  } catch (err) {
    console.error('[stock] invoice.refunded handler failed:', err.message);
  }
}

function register() {
  subscribe('order.completed', handleOrderCompleted);
  subscribe('invoice.paid', handleInvoicePaid);
  subscribe('invoice.refunded', handleInvoiceRefunded);
}

module.exports = { register };
