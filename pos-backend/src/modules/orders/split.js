// Pure, DB-free split-billing math. Kept separate from orders.service.js so
// it can be unit tested (split.test.js) without a database.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Partitions an order's items into the invoice groups requested by the
 * cashier. `splits` is an array of arrays of item ids (order.items[]._id).
 * Every item id must appear in exactly one group, and every order item must
 * be covered — otherwise this throws a 400.
 *
 * @param {Array} orderItems - order.items (each with an `_id`)
 * @param {Array<Array<string>>} splits
 * @returns {Array<Array>} one array of item subdocs per invoice
 */
function splitByItems(orderItems, splits) {
  if (!Array.isArray(splits) || splits.length === 0) {
    const err = new Error('splits must be a non-empty array of item-id arrays');
    err.status = 400;
    throw err;
  }

  const byId = new Map(orderItems.map((item) => [String(item._id), item]));
  const seen = new Set();
  const result = [];

  for (const group of splits) {
    if (!Array.isArray(group) || group.length === 0) {
      const err = new Error('Each split group must be a non-empty array of item ids');
      err.status = 400;
      throw err;
    }

    const subset = [];
    for (const rawId of group) {
      const id = String(rawId);
      const item = byId.get(id);

      if (!item) {
        const err = new Error(`Item ${id} does not belong to this order`);
        err.status = 400;
        throw err;
      }
      if (seen.has(id)) {
        const err = new Error(`Item ${id} appears in more than one split group`);
        err.status = 400;
        throw err;
      }

      seen.add(id);
      subset.push(item);
    }

    result.push(subset);
  }

  if (seen.size !== byId.size) {
    const err = new Error('Every order item must be covered by exactly one split group');
    err.status = 400;
    throw err;
  }

  return result;
}

/**
 * Builds N synthetic single-line invoice-item payloads that split an order's
 * subtotal/tax evenly. The last share absorbs whatever rounding remainder is
 * left over from `round2`-ing the first N-1 shares, so that once each payload
 * is run back through the standard subtotal/tax/total computation, the sum of
 * the resulting invoice totals is exactly equal to the order's total (no
 * rounding drift).
 *
 * @param {{subtotal:number, tax:number, orderNumber:string}} order
 * @param {number} ways
 * @returns {Array<Array<{name:string, qty:number, price:number, taxRate:number}>>}
 *   one single-item array per invoice, mirroring splitByItems' return shape.
 */
function splitEqually(order, ways) {
  const n = parseInt(ways, 10);
  if (!Number.isInteger(n) || n < 1) {
    const err = new Error('ways must be a positive integer');
    err.status = 400;
    throw err;
  }

  const subtotal = order.subtotal || 0;
  const tax = order.tax || 0;
  // Unrounded — deliberately kept at full precision so the last share's
  // reverse-derived taxRate reproduces its remainder tax exactly.
  const effectiveRate = subtotal > 0 ? (tax / subtotal) * 100 : 0;

  const shares = [];
  let subtotalAccum = 0;
  let taxAccum = 0;

  for (let i = 0; i < n - 1; i += 1) {
    const shareSubtotal = round2(subtotal / n);
    const shareTax = round2((shareSubtotal * effectiveRate) / 100);
    subtotalAccum = round2(subtotalAccum + shareSubtotal);
    taxAccum = round2(taxAccum + shareTax);

    shares.push({
      name: `Share ${i + 1}/${n} — ${order.orderNumber}`,
      qty: 1,
      price: shareSubtotal,
      taxRate: effectiveRate,
    });
  }

  const lastSubtotal = round2(subtotal - subtotalAccum);
  const lastTax = round2(tax - taxAccum);
  const lastTaxRate = lastSubtotal > 0 ? (lastTax / lastSubtotal) * 100 : 0;

  shares.push({
    name: `Share ${n}/${n} — ${order.orderNumber}`,
    qty: 1,
    price: lastSubtotal,
    taxRate: lastTaxRate,
  });

  return shares.map((item) => [item]);
}

module.exports = { splitByItems, splitEqually, round2 };
