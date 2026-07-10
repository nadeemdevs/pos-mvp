const mongoose = require('mongoose');

// Global mongoose plugin — adds tenantId/branchId to EVERY schema compiled
// after this file is required. Mongoose applies global plugins (registered
// via mongoose.plugin()) inside the Schema constructor, so as long as this
// module is the very first thing required (before any model file), every
// model in the app gets these fields automatically without each model.js
// having to opt in.
//
// Values are plain strings (not refs) — there is no Tenant/Branch-scoped
// auth model yet, this is scaffolding for the eventual multi-tenant split.
// 'default'/'main' match the single-tenant, single-branch reality of the
// current deployment.
function tenantPlugin(schema) {
  // Avoid double-adding if this plugin somehow runs twice against the same
  // schema (e.g. a future re-require during tests).
  if (schema.path('tenantId') || schema.path('branchId')) return;

  schema.add({
    tenantId: { type: String, default: 'default', index: true },
    branchId: { type: String, default: 'main', index: true },
  });
}

mongoose.plugin(tenantPlugin);

module.exports = tenantPlugin;
