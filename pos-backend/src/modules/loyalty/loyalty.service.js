const Customer = require('../customers/customer.model');
const Invoice = require('../billing/invoice.model');
const Setting = require('../settings/setting.model');
const LoyaltyTransaction = require('./loyaltyTransaction.model');
const auditService = require('../audit/audit.service');
const eventBus = require('../../common/eventBus');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function notFound(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function getSettings() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return settings;
}

// Highest tier whose minPoints <= lifetime, falling back to the lowest tier.
function computeTier(lifetimePoints, tiers) {
  if (!tiers || !tiers.length) return 'Bronze';
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  let current = sorted[0].name;
  for (const tier of sorted) {
    if (lifetimePoints >= tier.minPoints) current = tier.name;
  }
  return current;
}

async function recordTransaction({ customer, type, points, refType, refId, note }) {
  const txn = await LoyaltyTransaction.create({
    customerId: customer._id,
    type,
    points,
    refType,
    refId,
    note,
    balanceAfter: customer.loyalty.points,
  });
  return txn;
}

// Idempotent EARN + REFERRAL handler, fired off the 'invoice.paid' event.
// Guarded by a claim flag on the invoice itself (loyaltyProcessed), same
// pattern as inventory's stockDeducted guard.
async function processInvoicePaid(invoice) {
  if (!invoice || !invoice._id || !invoice.customerId) return;

  const settings = await getSettings();
  if (!settings.features || !settings.features.loyalty) return;

  const claimed = await Invoice.findOneAndUpdate(
    { _id: invoice._id, loyaltyProcessed: { $ne: true } },
    { $set: { loyaltyProcessed: true } },
    { new: true }
  );
  if (!claimed) return; // already processed — no-op

  const loyaltyCfg = settings.loyalty || {};
  const pointsPer100 = loyaltyCfg.pointsPer100 !== undefined ? loyaltyCfg.pointsPer100 : 5;
  const points = Math.floor(((claimed.total || 0) / 100) * pointsPer100);

  const customer = await Customer.findById(claimed.customerId);
  if (!customer) return;

  if (points > 0) {
    customer.loyalty.points += points;
    customer.loyalty.lifetimePoints += points;
    customer.loyalty.tier = computeTier(customer.loyalty.lifetimePoints, loyaltyCfg.tiers);
    await customer.save();

    await recordTransaction({
      customer,
      type: 'EARN',
      points,
      refType: 'INVOICE',
      refId: claimed._id,
      note: `Earned on invoice ${claimed.invoiceNumber}`,
    });

    eventBus.publish('loyalty.earned', { customerId: customer._id, points, balance: customer.loyalty.points });

    auditService.log({
      action: 'loyalty.earned',
      entity: 'Customer',
      entityId: customer._id,
      meta: { points, invoiceId: claimed._id, invoiceNumber: claimed.invoiceNumber },
    });
  }

  // Referral bonus — awarded once, on the referred customer's first paid
  // invoice, to the referrer.
  if (customer.referredBy && !customer.referralRewarded) {
    const referrer = await Customer.findById(customer.referredBy);
    if (referrer) {
      const bonus = loyaltyCfg.referralBonus !== undefined ? loyaltyCfg.referralBonus : 100;
      referrer.loyalty.points += bonus;
      referrer.loyalty.lifetimePoints += bonus;
      referrer.loyalty.tier = computeTier(referrer.loyalty.lifetimePoints, loyaltyCfg.tiers);
      await referrer.save();

      await recordTransaction({
        customer: referrer,
        type: 'REFERRAL',
        points: bonus,
        refType: 'INVOICE',
        refId: claimed._id,
        note: `Referral bonus for referring ${customer.name}`,
      });

      auditService.log({
        action: 'loyalty.referral',
        entity: 'Customer',
        entityId: referrer._id,
        meta: { bonus, referredCustomerId: customer._id, invoiceId: claimed._id },
      });
    }

    customer.referralRewarded = true;
    await customer.save();
  }
}

async function redeemPoints({ invoiceId, points }, user) {
  const pointsNum = Number(points);
  if (!Number.isInteger(pointsNum) || pointsNum <= 0) {
    throw badRequest('points must be a positive integer');
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw notFound('Invoice not found');

  if (invoice.loyaltyPoints) {
    throw badRequest('Loyalty points have already been redeemed on this invoice');
  }

  if (invoice.paymentStatus !== 'PENDING') {
    throw badRequest('Points can only be redeemed on a PENDING invoice');
  }

  if (!invoice.customerId) {
    throw badRequest('Invoice has no associated customer');
  }

  const customer = await Customer.findById(invoice.customerId);
  if (!customer) throw notFound('Customer not found');

  if ((customer.loyalty.points || 0) < pointsNum) {
    throw badRequest('Customer does not have enough loyalty points');
  }

  const settings = await getSettings();
  const pointValue = settings.loyalty && settings.loyalty.pointValue !== undefined ? settings.loyalty.pointValue : 0.25;

  const discountAmount = round2(pointsNum * pointValue);
  if (discountAmount > invoice.total) {
    throw badRequest('Redemption value cannot exceed the invoice total');
  }

  invoice.loyaltyPoints = pointsNum;
  invoice.loyaltyDiscount = discountAmount;
  invoice.total = round2(invoice.total - discountAmount);
  await invoice.save();

  customer.loyalty.points -= pointsNum;
  await customer.save();

  await recordTransaction({
    customer,
    type: 'REDEEM',
    points: -pointsNum,
    refType: 'INVOICE',
    refId: invoice._id,
    note: `Redeemed on invoice ${invoice.invoiceNumber}`,
  });

  auditService.log({
    user,
    action: 'loyalty.redeemed',
    entity: 'Invoice',
    entityId: invoice._id,
    meta: { points: pointsNum, discountAmount, customerId: customer._id },
  });

  return invoice;
}

async function adjustPoints({ customerId, points, note }, user) {
  const pointsNum = Number(points);
  if (!customerId || !Number.isInteger(pointsNum) || pointsNum === 0) {
    throw badRequest('customerId and a non-zero integer points value are required');
  }

  const customer = await Customer.findById(customerId);
  if (!customer) throw notFound('Customer not found');

  const settings = await getSettings();

  customer.loyalty.points += pointsNum;
  if (pointsNum > 0) {
    customer.loyalty.lifetimePoints += pointsNum;
  }
  customer.loyalty.tier = computeTier(customer.loyalty.lifetimePoints, settings.loyalty && settings.loyalty.tiers);
  await customer.save();

  const txn = await recordTransaction({
    customer,
    type: 'ADJUST',
    points: pointsNum,
    refType: 'MANUAL',
    refId: undefined,
    note: note || '',
  });

  auditService.log({
    user,
    action: 'loyalty.adjusted',
    entity: 'Customer',
    entityId: customer._id,
    meta: { points: pointsNum, note },
  });

  return { customer, transaction: txn };
}

async function getSummary(customerId) {
  const customer = await Customer.findById(customerId);
  if (!customer) throw notFound('Customer not found');

  const settings = await getSettings();
  const tiers = (settings.loyalty && settings.loyalty.tiers) || [];
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);

  let nextTier = null;
  for (const tier of sorted) {
    if (tier.minPoints > customer.loyalty.lifetimePoints) {
      nextTier = { name: tier.name, pointsNeeded: tier.minPoints - customer.loyalty.lifetimePoints };
      break;
    }
  }

  return {
    points: customer.loyalty.points,
    lifetimePoints: customer.loyalty.lifetimePoints,
    tier: customer.loyalty.tier,
    nextTier,
    pointValue: settings.loyalty ? settings.loyalty.pointValue : 0.25,
  };
}

async function listTransactions(customerId, query) {
  const { page = 1, limit = 20 } = query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

  const filter = { customerId };

  const [items, total] = await Promise.all([
    LoyaltyTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    LoyaltyTransaction.countDocuments(filter),
  ]);

  return { items, total, page: pageNum };
}

// Refund redeemed points when a PENDING invoice is cancelled — the sale
// never happened, so the customer gets their points back. Idempotent: the
// loyaltyPoints field is cleared as part of the refund.
async function refundRedemption(invoice) {
  const points = invoice.loyaltyPoints;
  if (!points || !invoice.customerId) return null;

  const Customer = require('../customers/customer.model');
  const customer = await Customer.findById(invoice.customerId);
  if (!customer) return null;

  customer.loyalty = customer.loyalty || { points: 0, lifetimePoints: 0, tier: 'Bronze' };
  customer.loyalty.points += points;
  await customer.save();

  const txn = await recordTransaction({
    customer,
    type: 'ADJUST',
    points,
    refType: 'INVOICE',
    refId: invoice._id,
    note: `Refund for cancelled invoice ${invoice.invoiceNumber}`,
  });

  invoice.loyaltyPoints = 0;
  invoice.loyaltyDiscount = 0;
  return txn;
}

module.exports = {
  computeTier,
  processInvoicePaid,
  redeemPoints,
  adjustPoints,
  getSummary,
  listTransactions,
  refundRedemption,
};
