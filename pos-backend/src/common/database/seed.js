// MUST be required before any model file (Role/User/... below) — registers
// the global tenantId/branchId plugin. See tenantPlugin.js.
require('./tenantPlugin');
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const config = require('../../config');
const requestContext = require('../requestContext');
const { provisionTenant } = require('./provisionTenant');
const Tenant = require('../../modules/tenants/tenant.model');
const Category = require('../../modules/menu/category.model');
const MenuItem = require('../../modules/menu/menuItem.model');
const Setting = require('../../modules/settings/setting.model');

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

// Demo menu — seeded only for the 'default' tenant (new tenants start with
// an empty menu). Runs inside the default tenant's request context so the
// upsert lookups stay scoped and new docs get stamped.
async function seedMenu() {
  return requestContext.run({ tenantId: 'default', branchId: 'main' }, async () => {
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
  });
}

// Ensure the platform-level Tenant record for the pre-existing 'default'
// tenant. Name comes from the existing settings doc when present.
async function ensureDefaultTenant() {
  const existing = await Tenant.findOne({ slug: 'default' });
  if (existing) return existing;

  const settings = await requestContext.run({ tenantId: 'default', branchId: 'main' }, () =>
    Setting.findOne()
  );

  return Tenant.create({
    name: (settings && settings.restaurantName) || 'Main Restaurant',
    slug: 'default',
    ownerEmail: 'admin@pos.local',
    status: 'ACTIVE',
  });
}

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log(`[seed] connected: ${config.mongoUri}`);

  const tenant = await ensureDefaultTenant();
  console.log(`[seed] tenant ensured: ${tenant.slug} (${tenant.name})`);

  const passwordHash = await bcrypt.hash('admin123', 10);
  await provisionTenant({
    tenantId: 'default',
    restaurantName: tenant.name,
    owner: { name: 'Admin', email: 'admin@pos.local', passwordHash },
  });
  console.log('[seed] roles, settings, branch, admin user upserted (admin@pos.local / admin123)');

  // Phase 6.4a — Arabian Cafe (the 'default' tenant) is now a plain, ordinary
  // tenant, exactly as it should be. The old Phase 6.2 platformAdmin flag on
  // admin@pos.local has been retired entirely (see migrateRemovePlatformAdmin.js
  // for the one-off cleanup of any live documents that still carry it). The
  // platform operator is now a completely separate identity — bootstrap one
  // via `npm run create-operator`.

  await seedMenu();
  console.log('[seed] categories and menu items upserted');

  console.log('[seed] done');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
