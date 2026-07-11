// MUST be required before any model file (Role/User/... below) — registers
// the global tenantId/branchId plugin. See tenantPlugin.js.
require('./tenantPlugin');
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const config = require('../../config');
const Role = require('../../modules/roles/role.model');
const User = require('../../modules/users/user.model');
const Category = require('../../modules/menu/category.model');
const MenuItem = require('../../modules/menu/menuItem.model');
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

// Manager keeps everything it had before (all except roles.manage), plus
// the two new operational permissions from Phase 5.1 — audit.view (Admin
// only) and branches.manage stay off Manager per spec. Phase 5.2's three new
// permissions are NOT excluded, so Manager gets all of them automatically.
const MANAGER_ONLY_EXCLUDED = ['roles.manage', 'audit.view', 'branches.manage'];
const MANAGER_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !MANAGER_ONLY_EXCLUDED.includes(p));

const CASHIER_PERMISSIONS = ['billing.create', 'billing.view', 'payments.take', 'orders.take', 'shifts.manage'];

const WAITER_PERMISSIONS = ['orders.take', 'reservations.manage'];

const KITCHEN_PERMISSIONS = ['kitchen.view'];

const CATEGORIES = [
  {
    name: 'Beverages',
    sortOrder: 1,
    items: [
      { name: 'Masala Chai', price: 20 },
      { name: 'Filter Coffee', price: 25 },
      { name: 'Cold Coffee', price: 60 },
      { name: 'Fresh Lime Soda', price: 40 },
    ],
  },
  {
    name: 'Snacks',
    sortOrder: 2,
    items: [
      { name: 'Samosa (2 pcs)', price: 30 },
      { name: 'Veg Cutlet', price: 40 },
      { name: 'Onion Pakoda', price: 50 },
      { name: 'Bread Omelette', price: 60 },
    ],
  },
  {
    name: 'Meals',
    sortOrder: 3,
    items: [
      { name: 'Veg Thali', price: 120 },
      { name: 'Chicken Biryani', price: 180 },
      { name: 'Paneer Butter Masala + Rice', price: 150 },
      { name: 'Curd Rice', price: 70 },
    ],
  },
  {
    name: 'Desserts',
    sortOrder: 4,
    items: [
      { name: 'Gulab Jamun (2 pcs)', price: 40 },
      { name: 'Rasmalai (2 pcs)', price: 60 },
      { name: 'Vanilla Ice Cream', price: 50 },
    ],
  },
];

async function seedRoles() {
  const roleDefs = [
    { name: 'Admin', permissions: ALL_PERMISSIONS },
    { name: 'Manager', permissions: MANAGER_PERMISSIONS },
    { name: 'Cashier', permissions: CASHIER_PERMISSIONS },
    { name: 'Waiter', permissions: WAITER_PERMISSIONS },
    { name: 'Kitchen', permissions: KITCHEN_PERMISSIONS },
  ];

  const roles = {};
  for (const def of roleDefs) {
    const role = await Role.findOneAndUpdate(
      { name: def.name },
      { name: def.name, permissions: def.permissions },
      { new: true, upsert: true }
    );
    roles[def.name] = role;
  }
  return roles;
}

async function seedAdminUser(adminRole) {
  const email = 'admin@pos.local';
  const passwordHash = await bcrypt.hash('admin123', 10);

  const user = await User.findOneAndUpdate(
    { email },
    {
      name: 'Admin',
      email,
      passwordHash,
      role: adminRole._id,
      active: true,
    },
    { new: true, upsert: true }
  );

  return user;
}

async function seedMenu() {
  for (const cat of CATEGORIES) {
    const category = await Category.findOneAndUpdate(
      { name: cat.name },
      { name: cat.name, sortOrder: cat.sortOrder },
      { new: true, upsert: true }
    );

    for (const item of cat.items) {
      await MenuItem.findOneAndUpdate(
        { name: item.name, categoryId: category._id },
        {
          categoryId: category._id,
          name: item.name,
          price: item.price,
          taxRate: 5,
          active: true,
        },
        { new: true, upsert: true }
      );
    }
  }
}

async function seedSettings() {
  const existing = await Setting.findOne();
  if (!existing) {
    await Setting.create({
      restaurantName: 'Malabar Cafe',
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
}

async function seedBranch() {
  return Branch.findOneAndUpdate(
    { code: 'main' },
    { code: 'main', name: 'Main Branch', active: true },
    { new: true, upsert: true }
  );
}

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(`[seed] connected: ${config.mongoUri}`);

  const roles = await seedRoles();
  console.log('[seed] roles upserted:', Object.keys(roles).join(', '));

  await seedAdminUser(roles.Admin);
  console.log('[seed] admin user upserted: admin@pos.local / admin123');

  await seedMenu();
  console.log('[seed] categories and menu items upserted');

  await seedSettings();
  console.log('[seed] settings ensured');

  await seedBranch();
  console.log('[seed] branch upserted: main');

  console.log('[seed] done');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
