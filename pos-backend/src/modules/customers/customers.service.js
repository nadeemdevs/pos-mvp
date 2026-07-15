const Customer = require('./customer.model');
const Invoice = require('../billing/invoice.model');

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Escape user-supplied search text before dropping it into a $regex filter.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listCustomers(query) {
  const { search, page = 1, limit = 20 } = query;
  const filter = {};

  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [{ name: { $regex: safe, $options: 'i' } }, { phone: { $regex: safe, $options: 'i' } }];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const [items, total] = await Promise.all([
    Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Customer.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

// Validates a `referredBy` customer id: must exist and must not be the
// customer referencing it (self-referral). Returns the resolved id or
// undefined if none was supplied.
async function resolveReferredBy(referredBy, selfId) {
  if (referredBy === undefined || referredBy === null || referredBy === '') return undefined;

  if (selfId && String(referredBy) === String(selfId)) {
    const err = new Error('A customer cannot refer themselves');
    err.status = 400;
    throw err;
  }

  const referrer = await Customer.findById(referredBy);
  if (!referrer) {
    const err = new Error('referredBy customer not found');
    err.status = 400;
    throw err;
  }

  return referrer._id;
}

async function createCustomer(payload) {
  const { name, phone, email, notes, referredBy } = payload;

  if (!name || !phone) {
    const err = new Error('name and phone are required');
    err.status = 400;
    throw err;
  }

  const resolvedReferredBy = await resolveReferredBy(referredBy);

  return Customer.create({ name, phone, email, notes, referredBy: resolvedReferredBy });
}

async function updateCustomer(id, payload) {
  const { name, phone, email, notes, referredBy } = payload;

  const update = { name, phone, email, notes };
  if (referredBy !== undefined) {
    update.referredBy = await resolveReferredBy(referredBy, id);
  }

  const customer = await Customer.findByIdAndUpdate(id, update, { new: true, runValidators: true });

  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  return customer;
}

async function deleteCustomer(id) {
  const customer = await Customer.findByIdAndDelete(id);
  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }
  return customer;
}

async function getCustomerWithStats(id) {
  const customer = await Customer.findById(id);
  if (!customer) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  const [agg] = await Invoice.aggregate([
    { $match: { customerId: customer._id, paymentStatus: 'PAID' } },
    {
      $group: {
        _id: null,
        invoiceCount: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        lastVisit: { $max: '$createdAt' },
      },
    },
  ]);

  const topItems = await Invoice.aggregate([
    { $match: { customerId: customer._id, paymentStatus: 'PAID' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        qty: { $sum: '$items.qty' },
        amount: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
      },
    },
    { $sort: { qty: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, name: '$_id', qty: 1, amount: 1 } },
  ]);

  return {
    customer,
    stats: {
      invoiceCount: agg ? agg.invoiceCount : 0,
      totalSpent: agg ? round2(agg.totalSpent) : 0,
      lastVisit: agg ? agg.lastVisit : null,
    },
    topItems: topItems.map((i) => ({ ...i, amount: round2(i.amount) })),
  };
}

async function getCustomerInvoices(id, query) {
  const { page = 1, limit = 20 } = query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const filter = { customerId: id };

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Invoice.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

/**
 * Shared by the billing module: given the embedded {name, phone} snapshot a
 * cashier types into an invoice, find-or-create the matching Customer record
 * by phone. Never overwrites an existing customer's name with an empty one.
 * Returns null if no usable phone was supplied.
 */
async function upsertByPhone({ name, phone } = {}) {
  if (!phone) return null;
  const trimmedPhone = String(phone).trim();
  if (!trimmedPhone) return null;

  const trimmedName = name && String(name).trim();

  const update = { $set: { phone: trimmedPhone } };
  if (trimmedName) {
    update.$set.name = trimmedName;
  } else {
    update.$setOnInsert = { name: 'Guest' };
  }

  const customer = await Customer.findOneAndUpdate(
    { phone: trimmedPhone },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return customer;
}

module.exports = {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerWithStats,
  getCustomerInvoices,
  upsertByPhone,
  escapeRegex,
};
