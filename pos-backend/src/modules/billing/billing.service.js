const Invoice = require('./invoice.model');
const Payment = require('../payments/payment.model');
const Setting = require('../settings/setting.model');
const customersService = require('../customers/customers.service');
const auditService = require('../audit/audit.service');
const eventBus = require('../../common/eventBus');
const { nextInvoiceNumber } = require('../../common/utils/invoiceNumber');

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }
  return settings;
}

function computeItemTotals(items = []) {
  let subtotal = 0;
  let tax = 0;

  for (const item of items) {
    const lineAmount = item.price * item.qty;
    const lineTax = (lineAmount * (item.taxRate || 0)) / 100;
    subtotal += lineAmount;
    tax += lineTax;
  }

  return { subtotal: round2(subtotal), tax: round2(tax) };
}

// GST-registered Indian businesses must show tax as two equal halves
// (SGST + CGST) rather than one lump amount. sgst+cgst is made to add up to
// exactly `tax` (rather than each being a bare tax/2) so rounding never
// leaves the invoice a cent off.
function splitGst(tax, settings) {
  if (!settings || settings.country !== 'India') {
    return { sgst: 0, cgst: 0 };
  }
  const sgst = round2(tax / 2);
  const cgst = round2(tax - sgst);
  return { sgst, cgst };
}

// Normalizes the discount fields a client may send. New clients send
// {discountType, discountValue}; legacy clients send a plain {discount}
// number, which is treated as a FLAT amount for backward compatibility.
function resolveDiscountInput(payload) {
  const { discountType, discountValue, discount } = payload;

  if (discountType !== undefined || discountValue !== undefined) {
    return {
      discountType: discountType === 'PERCENT' ? 'PERCENT' : 'FLAT',
      discountValue: Number(discountValue) || 0,
    };
  }

  if (discount !== undefined) {
    return { discountType: 'FLAT', discountValue: Number(discount) || 0 };
  }

  return { discountType: 'FLAT', discountValue: 0 };
}

function hasDiscountFields(payload) {
  return payload.discount !== undefined || payload.discountType !== undefined || payload.discountValue !== undefined;
}

function computeDiscountAmount(subtotal, tax, discountType, discountValue) {
  if (discountType === 'PERCENT') {
    return round2((subtotal + tax) * (discountValue / 100));
  }
  return round2(discountValue);
}

// Discount may never exceed subtotal+tax, and (for non-Admins) may never
// exceed settings.discounts.maxPercent of subtotal+tax — unless a valid
// manager-approval token was presented (Phase 5.2), in which case the
// maxPercent check is bypassed (the hard subtotal+tax ceiling still applies).
function validateDiscount(discount, grossTotal, settings, user, approved = false) {
  if (discount > grossTotal) {
    const err = new Error('Discount cannot exceed subtotal plus tax');
    err.status = 400;
    throw err;
  }

  const maxPercent = settings && settings.discounts ? settings.discounts.maxPercent : 100;

  if (grossTotal > 0 && discount > 0) {
    const effectivePercent = (discount / grossTotal) * 100;
    const isAdmin = user && user.role === 'Admin';
    if (effectivePercent > maxPercent && !isAdmin && !approved) {
      const err = new Error(`Discount exceeds the maximum allowed ${maxPercent}%`);
      err.status = 400;
      throw err;
    }
  }
}

function applyRounding(total, settings) {
  if (!settings || !settings.rounding || !settings.rounding.enabled) {
    return { total: round2(total), roundOff: 0 };
  }

  const nearest = settings.rounding.nearest || 1;
  const roundedTotal = Math.round(total / nearest) * nearest;
  const roundOff = round2(roundedTotal - total);

  return { total: round2(total + roundOff), roundOff };
}

// Shared by createInvoice (Mode 1, POST /api/invoice) and createFromOrder
// (Mode 2, dine-in orders billing out via InvoiceService) — the single place
// that actually persists an Invoice, so both paths get identical
// subtotal/tax/discount/rounding computation.
async function buildInvoice({
  items,
  customer,
  status = 'OPEN',
  note,
  discountType = 'FLAT',
  discountValue = 0,
  user,
  orderId,
  orderNumber,
  approved = false,
}) {
  if (!items.length) {
    const err = new Error('Invoice must have at least one item');
    err.status = 400;
    throw err;
  }

  const settings = await getSettings();
  const { subtotal, tax } = computeItemTotals(items);
  const { sgst, cgst } = splitGst(tax, settings);
  const grossTotal = round2(subtotal + tax);

  const discount = computeDiscountAmount(subtotal, tax, discountType, discountValue);

  validateDiscount(discount, grossTotal, settings, user, approved);

  const { total, roundOff } = applyRounding(round2(grossTotal - discount), settings);

  const invoiceNumber = await nextInvoiceNumber();

  let customerId = null;
  if (customer && customer.phone) {
    const customerDoc = await customersService.upsertByPhone(customer);
    customerId = customerDoc ? customerDoc._id : null;
  }

  const invoice = await Invoice.create({
    invoiceNumber,
    items,
    subtotal,
    tax,
    sgst,
    cgst,
    discount,
    discountType,
    discountValue,
    roundOff,
    total,
    note,
    customer,
    customerId,
    status,
    paymentStatus: 'PENDING',
    cashier: { id: user.id, name: user.name },
    orderId,
    orderNumber,
  });

  return invoice;
}

async function createInvoice(payload, user, { approved = false } = {}) {
  const { items = [], customer, status = 'OPEN', note } = payload;
  const { discountType, discountValue } = resolveDiscountInput(payload);

  return buildInvoice({ items, customer, status, note, discountType, discountValue, user, approved });
}

// Maps embedded Order.items (menuItemId/price/qty/taxRate/modifiers) into
// invoice-item shape. Modifiers are folded into the price and named inline
// ('Veg Thali + Extra Ghee') since Invoice.items has no modifiers field of
// its own. Items that are already flat (e.g. the synthetic EQUAL-split share
// lines from orders/split.js, which have no `modifiers`) pass through
// untouched aside from rounding.
function mapOrderItemsToInvoiceItems(items) {
  return items.map((item) => {
    const modifiers = item.modifiers || [];
    const modifierTotal = modifiers.reduce((sum, m) => sum + (m.price || 0), 0);
    const name = modifiers.length ? `${item.name} + ${modifiers.map((m) => m.name).join(' + ')}` : item.name;

    return {
      menuItemId: item.menuItemId,
      name,
      price: round2(item.price + modifierTotal),
      qty: item.qty,
      taxRate: item.taxRate || 0,
    };
  });
}

// InvoiceService.createFromOrder — the ONLY way Mode 2 (dine-in) invoices get
// created. Reuses buildInvoice so order-billed invoices go through the exact
// same computation path as Mode 1 invoices. `subsetItems` is either a subset
// of order.items (FULL/ITEMS split modes) or synthetic share line(s) from
// orders/split.js splitEqually (EQUAL mode).
async function createFromOrder(order, subsetItems, { label, cashier } = {}) {
  const items = mapOrderItemsToInvoiceItems(subsetItems);

  return buildInvoice({
    items,
    note: label,
    status: 'OPEN',
    discountType: 'FLAT',
    discountValue: 0,
    user: cashier,
    orderId: order._id,
    orderNumber: order.orderNumber,
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listInvoices(query) {
  const { date, paymentStatus, status, search, page = 1, limit = 20 } = query;
  const filter = {};

  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (status) filter.status = status;

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    filter.createdAt = { $gte: start, $lte: end };
  }

  if (search && search.trim()) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ invoiceNumber: re }, { 'customer.phone': re }, { 'customer.name': re }];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Invoice.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

async function getInvoice(id) {
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  return invoice;
}

async function updateInvoice(id, payload, user, { approved = false, canEditPaid = false } = {}) {
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }

  const { items, customer, status, note } = payload;

  if (status === 'CANCELLED') {
    if (invoice.paymentStatus === 'PAID') {
      const err = new Error('Cannot cancel a paid invoice this way — use refund instead');
      err.status = 400;
      throw err;
    }
    // Give back any loyalty points redeemed against this (unpaid) bill.
    if (invoice.paymentStatus === 'PENDING' && invoice.loyaltyPoints > 0) {
      try {
        const loyaltyService = require('../loyalty/loyalty.service');
        await loyaltyService.refundRedemption(invoice);
      } catch (err) {
        console.error('[billing] loyalty refund on cancel failed:', err.message);
      }
    }
    invoice.status = 'CANCELLED';
    await invoice.save();
    return invoice;
  }

  const discountFieldsChanged = hasDiscountFields(payload);
  const editingPaidInvoice = invoice.paymentStatus !== 'PENDING' && (items || discountFieldsChanged);

  if (editingPaidInvoice && !canEditPaid) {
    const err = new Error('Manager approval required to edit a paid invoice');
    err.status = 403;
    throw err;
  }

  const previousTotal = invoice.total;
  const previousItems = invoice.items;

  if (items) invoice.items = items;
  if (note !== undefined) invoice.note = note;
  if (status) invoice.status = status;

  if (customer !== undefined) {
    invoice.customer = customer;
    if (customer && customer.phone) {
      const customerDoc = await customersService.upsertByPhone(customer);
      invoice.customerId = customerDoc ? customerDoc._id : null;
    } else {
      invoice.customerId = null;
    }
  }

  const settings = await getSettings();
  const { subtotal, tax } = computeItemTotals(invoice.items);
  const { sgst, cgst } = splitGst(tax, settings);
  const grossTotal = round2(subtotal + tax);

  let discountType;
  let discountValue;
  let discount;

  if (discountFieldsChanged) {
    ({ discountType, discountValue } = resolveDiscountInput(payload));
    discount = computeDiscountAmount(subtotal, tax, discountType, discountValue);
  } else {
    // No discount info sent — keep the previously stored discount amount as-is
    // (it may pre-date discountType/discountValue existing on this document).
    discount = invoice.discount || 0;
    discountType = invoice.discountType || 'FLAT';
    discountValue = invoice.discountValue !== undefined && invoice.discountValue !== null ? invoice.discountValue : discount;
  }

  validateDiscount(discount, grossTotal, settings, user, approved);

  const { total: roundedTotal, roundOff } = applyRounding(round2(grossTotal - discount), settings);
  // Loyalty-point redemption (POST /api/loyalty/redeem) subtracts its
  // discount from `total` directly, after rounding, rather than folding into
  // the `discount` field above — mirror that same order here so re-editing
  // an invoice that had points redeemed against it doesn't silently drop
  // that discount from the recomputed total.
  const total = round2(roundedTotal - (invoice.loyaltyDiscount || 0));

  invoice.subtotal = subtotal;
  invoice.tax = tax;
  invoice.sgst = sgst;
  invoice.cgst = cgst;
  invoice.discount = discount;
  invoice.discountType = discountType;
  invoice.discountValue = discountValue;
  invoice.roundOff = roundOff;
  invoice.total = total;

  await invoice.save();

  if (editingPaidInvoice) {
    auditService.log({
      user,
      action: 'invoice.edited',
      entity: 'Invoice',
      entityId: invoice._id,
      meta: {
        invoiceNumber: invoice.invoiceNumber,
        previousTotal,
        newTotal: total,
        previousItemCount: previousItems.length,
        newItemCount: invoice.items.length,
      },
    });
  }

  return invoice;
}

// Full-invoice void of a PAID invoice: marks it REFUNDED, reverses stock and
// loyalty (earned + redeemed), and records a REFUND Payment for the audit
// trail. The paymentStatus transition below IS the idempotency claim — every
// side effect after it only runs once, because a concurrent/duplicate call
// finds the invoice no longer PAID and stops here.
async function refundInvoice(id, { method, user, req } = {}) {
  const claimed = await Invoice.findOneAndUpdate(
    { _id: id, paymentStatus: 'PAID' },
    { $set: { paymentStatus: 'REFUNDED', status: 'CANCELLED' } },
    { new: true }
  );

  if (!claimed) {
    const existing = await Invoice.findById(id);
    if (!existing) {
      const err = new Error('Invoice not found');
      err.status = 404;
      throw err;
    }
    const err = new Error('Invoice is not in a refundable (PAID) state');
    err.status = 400;
    throw err;
  }

  if (claimed.loyaltyPoints > 0) {
    try {
      const loyaltyService = require('../loyalty/loyalty.service');
      await loyaltyService.refundRedemption(claimed);
      await claimed.save();
    } catch (err) {
      console.error('[billing] loyalty redemption refund on invoice refund failed:', err.message);
    }
  }

  eventBus.publish('invoice.refunded', { invoice: claimed });

  const refundPayment = await Payment.create({
    invoiceId: claimed._id,
    method: method || claimed.paymentMethod || 'CASH',
    provider: method || claimed.paymentMethod || 'CASH',
    amount: claimed.total,
    type: 'REFUND',
    receivedBy: { id: user.id, name: user.name },
  });

  auditService.log({
    req,
    user,
    action: 'invoice.refunded',
    entity: 'Invoice',
    entityId: claimed._id,
    meta: { invoiceNumber: claimed.invoiceNumber, amount: claimed.total },
  });

  return { invoice: claimed, payment: refundPayment };
}

// Records collecting an extra amount (direction:'COLLECT') or handing cash
// back (direction:'REFUND') against an already-PAID invoice whose total
// changed after an edit — without touching paymentStatus (it's still fully
// PAID, just settled at a different amount than originally collected).
async function settleDelta(id, { amount, method, direction, user, req } = {}) {
  const invoice = await Invoice.findById(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (invoice.paymentStatus !== 'PAID') {
    const err = new Error('Only a paid invoice has a balance to settle');
    err.status = 400;
    throw err;
  }
  const settleAmount = Number(amount);
  if (!settleAmount || settleAmount <= 0) {
    const err = new Error('amount must be a positive number');
    err.status = 400;
    throw err;
  }

  const payment = await Payment.create({
    invoiceId: invoice._id,
    method: method || 'CASH',
    provider: method || 'CASH',
    amount: settleAmount,
    type: direction === 'REFUND' ? 'REFUND' : 'PAYMENT',
    receivedBy: { id: user.id, name: user.name },
  });

  auditService.log({
    req,
    user,
    action: 'invoice.settled',
    entity: 'Invoice',
    entityId: invoice._id,
    meta: { invoiceNumber: invoice.invoiceNumber, amount: settleAmount, direction: direction === 'REFUND' ? 'REFUND' : 'COLLECT' },
  });

  return payment;
}

module.exports = {
  computeItemTotals,
  createInvoice,
  createFromOrder,
  listInvoices,
  getInvoice,
  updateInvoice,
  refundInvoice,
  settleDelta,
};
