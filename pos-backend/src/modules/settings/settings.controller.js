const bcrypt = require('bcryptjs');
const Setting = require('./setting.model');
const Tenant = require('../tenants/tenant.model');
const Category = require('../menu/category.model');
const MenuItem = require('../menu/menuItem.model');
const Customer = require('../customers/customer.model');
const Invoice = require('../billing/invoice.model');
const Branch = require('../branches/branch.model');
const Table = require('../tables/table.model');
const asyncHandler = require('../../common/utils/asyncHandler');
const auditService = require('../audit/audit.service');
const { invalidateBranchAccess } = require('../../common/middleware/tenantContext');

// pinHash is a secret — never let it leave the server via GET /api/settings.
function stripSecrets(settings) {
  const obj = settings.toObject ? settings.toObject() : settings;
  if (obj.approvals) {
    obj.approvals = { ...obj.approvals, pinHash: undefined, pinSet: !!obj.approvals.pinHash };
    delete obj.approvals.pinHash;
  }
  return obj;
}

const getSettings = asyncHandler(async (req, res) => {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }
  res.json(stripSecrets(settings));
});

// Shallow-merge nested paymentProviders sub-objects so a PUT that only touches
// e.g. { paymentProviders: { mock: { outcome: 'FAILED' } } } doesn't wipe out
// the sibling fields (delayMs, etc.) or the other provider configs.
function mergePaymentProviders(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.enabled !== undefined) merged.enabled = incoming.enabled;

  for (const key of ['mock', 'pinelabs', 'worldline']) {
    if (incoming[key]) {
      merged[key] = { ...(currentObj[key] || {}), ...incoming[key] };
    }
  }

  return merged;
}

// Same shallow-merge idea as mergePaymentProviders, applied to the new
// discounts/rounding sub-objects so a PUT that only touches one field (e.g.
// { discounts: { maxPercent: 20 } }) doesn't wipe out sibling fields
// (presets, etc).
function mergeDiscounts(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.maxPercent !== undefined) merged.maxPercent = incoming.maxPercent;
  if (incoming.presets !== undefined) merged.presets = incoming.presets;

  return merged;
}

function mergeRounding(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.enabled !== undefined) merged.enabled = incoming.enabled;
  if (incoming.nearest !== undefined) merged.nearest = incoming.nearest;

  return merged;
}

// Same shallow-merge idea, one level deeper: printing.{kot,receipt} are each
// sub-objects of their own, so a PUT touching only printing.kot.host must not
// wipe printing.kot.port or printing.receipt entirely.
function mergePrinterTarget(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  return { ...currentObj, ...incoming };
}

function mergePrinting(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  for (const key of ['kot', 'receipt']) {
    if (incoming[key]) {
      merged[key] = mergePrinterTarget(currentObj[key], incoming[key]);
    }
  }

  return merged;
}

function mergeFeatures(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.dineIn !== undefined) merged.dineIn = incoming.dineIn;
  if (incoming.inventory !== undefined) merged.inventory = incoming.inventory;
  if (incoming.crm !== undefined) merged.crm = incoming.crm;
  if (incoming.loyalty !== undefined) merged.loyalty = incoming.loyalty;
  if (incoming.analytics !== undefined) merged.analytics = incoming.analytics;
  if (incoming.reservations !== undefined) merged.reservations = incoming.reservations;
  if (incoming.shifts !== undefined) merged.shifts = incoming.shifts;
  if (incoming.onlineOrdering !== undefined) merged.onlineOrdering = incoming.onlineOrdering;

  return merged;
}

// Same shallow-merge idea, one level deeper: delivery.{zomato,swiggy} are each
// sub-objects of their own, so a PUT touching only delivery.zomato.secret must
// not wipe delivery.zomato.enabled or delivery.swiggy entirely.
function mergeDeliveryPartner(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  return { ...currentObj, ...incoming };
}

function mergeDelivery(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  for (const key of ['zomato', 'swiggy']) {
    if (incoming[key]) {
      merged[key] = mergeDeliveryPartner(currentObj[key], incoming[key]);
    }
  }

  return merged;
}

// Phase 6.5 — per-user branch locking toggle.
function mergeBranchAccess(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.staffCanSwitchBranches !== undefined) {
    merged.staffCanSwitchBranches = Boolean(incoming.staffCanSwitchBranches);
  }

  return merged;
}

// Deep-merge round-trip for settings.loyalty — a PUT touching only e.g.
// { loyalty: { pointsPer100: 10 } } must not wipe out tiers/referralBonus/etc.
function mergeLoyalty(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  if (incoming.pointsPer100 !== undefined) merged.pointsPer100 = incoming.pointsPer100;
  if (incoming.pointValue !== undefined) merged.pointValue = incoming.pointValue;
  if (incoming.referralBonus !== undefined) merged.referralBonus = incoming.referralBonus;
  if (incoming.tiers !== undefined) merged.tiers = incoming.tiers;

  return merged;
}

function mergeApprovals(current, incoming) {
  const currentObj = current && current.toObject ? current.toObject() : current || {};
  const merged = { ...currentObj };

  // pinHash is never settable via this generic PUT — only via the dedicated
  // PUT /api/settings/approvals/pin endpoint below.
  if (incoming.requireForDiscountAboveMax !== undefined) {
    merged.requireForDiscountAboveMax = incoming.requireForDiscountAboveMax;
  }

  return merged;
}

const updateSettings = asyncHandler(async (req, res) => {
  const {
    restaurantName,
    address,
    phone,
    taxRate,
    currency,
    receiptFooter,
    paymentProviders,
    discounts,
    rounding,
    printing,
    features,
    loyalty,
    approvals,
    delivery,
    branchAccess,
  } = req.body;

  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }

  const previousName = settings.restaurantName;
  settings.restaurantName = restaurantName ?? settings.restaurantName;
  settings.address = address ?? settings.address;
  settings.phone = phone ?? settings.phone;
  settings.taxRate = taxRate ?? settings.taxRate;
  settings.currency = currency ?? settings.currency;
  settings.receiptFooter = receiptFooter ?? settings.receiptFooter;

  if (paymentProviders) {
    settings.paymentProviders = mergePaymentProviders(settings.paymentProviders, paymentProviders);
  }

  if (discounts) {
    settings.discounts = mergeDiscounts(settings.discounts, discounts);
  }

  if (rounding) {
    settings.rounding = mergeRounding(settings.rounding, rounding);
  }

  if (printing) {
    settings.printing = mergePrinting(settings.printing, printing);
  }

  if (features) {
    settings.features = mergeFeatures(settings.features, features);
  }

  if (loyalty) {
    settings.loyalty = mergeLoyalty(settings.loyalty, loyalty);
  }

  if (approvals) {
    settings.approvals = mergeApprovals(settings.approvals, approvals);
  }

  if (delivery) {
    settings.delivery = mergeDelivery(settings.delivery, delivery);
  }

  if (branchAccess) {
    settings.branchAccess = mergeBranchAccess(settings.branchAccess, branchAccess);
    // Take effect on the very next request rather than waiting out the
    // in-process cache TTL in tenantContext.js.
    invalidateBranchAccess(req.tenantId || (req.user && req.user.tenantId) || 'default');
  }

  await settings.save();

  // Phase 6.2 — keep the platform Tenant.name in sync when the restaurant is
  // renamed via settings (slug is immutable, so only the display name moves).
  // The Tenant registry is not tenant-scoped, so resolve it by the caller's
  // tenantId explicitly.
  if (settings.restaurantName !== previousName) {
    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'default';
    const tenant = await Tenant.findOne({ slug: tenantId });
    if (tenant && tenant.name !== settings.restaurantName) {
      tenant.name = settings.restaurantName;
      await tenant.save();
      auditService.log({
        req,
        action: 'tenant.renamed',
        entity: 'Tenant',
        entityId: tenant._id,
        meta: { slug: tenantId, from: previousName, to: settings.restaurantName },
      });
    }
  }

  auditService.log({
    req,
    action: 'settings.update',
    entity: 'Setting',
    entityId: settings._id,
    meta: req.body,
  });

  res.json(stripSecrets(settings));
});

// Admin-only. Sets/rotates the manager-override PIN used by POST
// /api/approvals/verify. The raw PIN is never stored or returned — only its
// bcrypt hash lives in settings.approvals.pinHash.
const setApprovalPin = asyncHandler(async (req, res) => {
  const { pin } = req.body;

  if (!pin || String(pin).trim().length < 4) {
    const err = new Error('pin is required and must be at least 4 characters');
    err.status = 400;
    throw err;
  }

  let settings = await Setting.findOne();
  if (!settings) {
    settings = await Setting.create({});
  }

  const pinHash = await bcrypt.hash(String(pin), 10);
  settings.approvals = { ...(settings.approvals ? settings.approvals.toObject() : {}), pinHash };
  await settings.save();

  auditService.log({
    req,
    action: 'approvals.pin.set',
    entity: 'Setting',
    entityId: settings._id,
  });

  res.json({ message: 'Approval PIN updated' });
});

// Strips secrets from a settings doc for the tenant data-export bundle —
// pinHash (approvals) plus any delivery/payment provider secrets. Deliberately
// separate from stripSecrets() above (used by GET /api/settings), since the
// export shape doesn't need the `pinSet` convenience flag.
function stripSettingsForExport(settings) {
  const obj = settings.toObject ? settings.toObject() : settings;
  const clone = JSON.parse(JSON.stringify(obj));

  if (clone.approvals) {
    delete clone.approvals.pinHash;
  }
  if (clone.delivery) {
    for (const key of Object.keys(clone.delivery)) {
      if (clone.delivery[key] && typeof clone.delivery[key] === 'object') {
        delete clone.delivery[key].secret;
      }
    }
  }
  if (clone.paymentProviders) {
    if (clone.paymentProviders.pinelabs) delete clone.paymentProviders.pinelabs.securityToken;
    if (clone.paymentProviders.worldline) delete clone.paymentProviders.worldline.securityToken;
  }

  return clone;
}

// GET /api/settings/export — AUTHENTICATED, permission 'settings.manage'.
// Uses AMBIENT tenant context (plain find({}) — the existing tenantPlugin
// scoping hooks already confine these to the caller's tenant); deliberately
// does NOT use skipTenantScope here, unlike auth's global-email lookups.
const exportTenantData = asyncHandler(async (req, res) => {
  const tenantSlug = req.tenantId || 'default';
  const tenant = await Tenant.findOne({ slug: tenantSlug });

  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});

  const [categories, menuItems, customers, branches, tables] = await Promise.all([
    Category.find({}).lean(),
    MenuItem.find({}).lean(),
    Customer.find({}).lean(),
    Branch.find({}).lean(),
    Table.find({}).lean(),
  ]);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const invoices = await Invoice.find({ createdAt: { $gte: ninetyDaysAgo } }).lean();

  const bundle = {
    exportedAt: new Date().toISOString(),
    tenant: {
      name: tenant ? tenant.name : tenantSlug,
      slug: tenant ? tenant.slug : tenantSlug,
    },
    settings: stripSettingsForExport(settings),
    categories,
    menuItems,
    customers,
    invoices,
    branches,
    tables,
  };

  auditService.log({
    req,
    action: 'tenant.data_exported',
    entity: 'Tenant',
    entityId: tenant ? tenant._id : undefined,
    meta: { slug: tenantSlug },
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="${tenantSlug}-export-${dateStamp}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(bundle, null, 2));
});

module.exports = { getSettings, updateSettings, setApprovalPin, exportTenantData };
