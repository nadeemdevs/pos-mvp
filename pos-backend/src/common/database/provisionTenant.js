// Reusable per-tenant provisioning — extracted from seed.js (Phase 6.1) so
// both the seed script (tenant 'default') and POST /api/auth/register (new
// tenants) share the exact same bootstrap: the 5 roles with their permission
// sets, the default settings doc, the 'main' branch, and the owner user as
// Admin. Every write runs inside requestContext.run({tenantId, branchId:
// 'main'}) so the tenant-scoping hooks both confine the upsert lookups to
// the tenant AND stamp tenantId/branchId onto anything newly created.
//
// Upsert-safe by construction: re-running against an existing tenant (the
// live 'default' data) matches the pre-existing docs and must not duplicate
// them. Behavior for 'default' is byte-for-byte the old seed.js behavior.
const requestContext = require('../requestContext');
const Role = require('../../modules/roles/role.model');
const User = require('../../modules/users/user.model');
const Setting = require('../../modules/settings/setting.model');
const Branch = require('../../modules/branches/branch.model');

const ALL_PERMISSIONS = [
  'billing.create',
  'billing.view',
  'menu.manage',
  'reports.view',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'payments.take',
  'customers.manage',
  'tables.manage',
  'orders.take',
  'kitchen.view',
  'inventory.manage',
  'purchasing.manage',
  'branches.manage',
  'audit.view',
  // Phase 5.2 permissions.
  'loyalty.manage',
  'reservations.manage',
  'shifts.manage',
  // Phase 5.3 permissions.
  'analytics.view',
];

// Manager keeps everything except roles.manage / audit.view / branches.manage
// (see the original seed.js rationale).
const MANAGER_ONLY_EXCLUDED = ['roles.manage', 'audit.view', 'branches.manage'];
const MANAGER_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !MANAGER_ONLY_EXCLUDED.includes(p));

const CASHIER_PERMISSIONS = ['billing.create', 'billing.view', 'payments.take', 'orders.take', 'shifts.manage'];
const WAITER_PERMISSIONS = ['orders.take', 'reservations.manage'];
const KITCHEN_PERMISSIONS = ['kitchen.view'];

const ROLE_DEFS = [
  { name: 'Admin', permissions: ALL_PERMISSIONS },
  { name: 'Manager', permissions: MANAGER_PERMISSIONS },
  { name: 'Cashier', permissions: CASHIER_PERMISSIONS },
  { name: 'Waiter', permissions: WAITER_PERMISSIONS },
  { name: 'Kitchen', permissions: KITCHEN_PERMISSIONS },
];

async function provisionRoles() {
  const roles = {};
  for (const def of ROLE_DEFS) {
    // Tenant scoping injects tenantId into both the filter and the upsert.
    // eslint-disable-next-line no-await-in-loop
    const role = await Role.findOneAndUpdate(
      { name: def.name },
      { name: def.name, permissions: def.permissions },
      { new: true, upsert: true }
    );
    roles[def.name] = role;
  }
  return roles;
}

async function provisionSettings(restaurantName) {
  const existing = await Setting.findOne();
  if (existing) return existing;

  return Setting.create({
    restaurantName: restaurantName || 'My Restaurant',
    address: '',
    phone: '',
    taxRate: 5,
    currency: 'INR',
    receiptFooter: 'Thank you for visiting!',
    paymentProviders: {
      enabled: ['MOCK'],
      mock: { delayMs: 5000, outcome: 'SUCCESS' },
    },
  });
}

async function provisionBranch() {
  return Branch.findOneAndUpdate(
    { code: 'main' },
    { code: 'main', name: 'Main Branch', active: true },
    { new: true, upsert: true }
  );
}

async function provisionOwner(owner, adminRole) {
  const email = String(owner.email).toLowerCase();
  return User.findOneAndUpdate(
    { email },
    {
      name: owner.name,
      email,
      passwordHash: owner.passwordHash,
      role: adminRole._id,
      active: true,
    },
    { new: true, upsert: true }
  );
}

/**
 * Provision (or repair) a tenant's baseline documents.
 * @param {object} args
 * @param {string} args.tenantId  the tenant's slug ('default' for the seed)
 * @param {string} args.restaurantName  used for the settings doc when created
 * @param {object} args.owner  { name, email, passwordHash }
 * @returns {{ roles, settings, branch, owner }}
 */
async function provisionTenant({ tenantId, restaurantName, owner }) {
  return requestContext.run({ tenantId, branchId: 'main' }, async () => {
    const roles = await provisionRoles();
    const settings = await provisionSettings(restaurantName);
    const branch = await provisionBranch();
    const ownerUser = await provisionOwner(owner, roles.Admin);
    return { roles, settings, branch, owner: ownerUser };
  });
}

module.exports = { provisionTenant, ALL_PERMISSIONS, ROLE_DEFS };
