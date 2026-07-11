const mongoose = require('mongoose');
const requestContext = require('../requestContext');

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

// Phase 5.3 branch-scoping hardening — opt-in per schema via
// `new mongoose.Schema({...}, { branchScoped: true })`. When set, every
// find-family query, countDocuments, and aggregate pipeline run against that
// model is automatically confined to the request's current branch (read from
// the AsyncLocalStorage context — see common/requestContext.js), UNLESS:
//   - there's no active request context (background scripts/migrations —
//     scoping would silently hide data with no way to opt back in), or
//   - the query already specifies a branchId itself (an explicit filter
//     always wins — this is how the analytics.branches cross-branch report
//     and admin tooling opt out, via `.setOptions({ skipBranchScope: true })`
//     — see below), or
//   - the caller passed `{ skipBranchScope: true }` as a query/aggregate
//     option — the one sanctioned escape hatch for legitimately cross-branch
//     reads (e.g. GET /api/analytics/branches).
//
// New documents get branchId stamped from the context on save (pre-save),
// so a POST made with `x-branch-id: b2` actually persists under branch b2
// instead of silently defaulting to 'main'.
function applyBranchScoping(schema) {
  function currentBranchId() {
    const ctx = requestContext.get();
    return ctx && ctx.branchId ? ctx.branchId : null;
  }

  const findMiddlewares = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndRemove',
    'update',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
  ];

  for (const method of findMiddlewares) {
    schema.pre(method, function branchScopeQuery() {
      if (this.getOptions && this.getOptions().skipBranchScope) return;

      const branchId = currentBranchId();
      if (!branchId) return;

      const filter = this.getFilter ? this.getFilter() : this._conditions;
      if (filter && filter.branchId === undefined) {
        filter.branchId = branchId;
      }
    });
  }

  schema.pre('aggregate', function branchScopeAggregate() {
    const opts = (this.options || {});
    if (opts.skipBranchScope) return;

    const branchId = currentBranchId();
    if (!branchId) return;

    const pipeline = this.pipeline();
    const alreadyScoped = pipeline.some(
      (stage) => stage && stage.$match && stage.$match.branchId !== undefined
    );
    if (!alreadyScoped) {
      pipeline.unshift({ $match: { branchId } });
    }
  });

  schema.pre('save', function branchScopeSave() {
    if (!this.isNew) return;

    const branchId = currentBranchId();
    if (!branchId) return;

    this.branchId = branchId;
  });
}

// A global mongoose.plugin() would also hit embedded subdocument schemas
// (order items, settings.features, ...), stamping tenant fields into every
// nested object. Instead, hook model compilation so only top-level
// collection schemas get the fields.
// Phase 6.1 tenant-scoping hardening — the tenant analogue of
// applyBranchScoping above, but applied to EVERY model by default. The only
// opt-out is `new mongoose.Schema({...}, { tenantScoped: false })`, reserved
// for platform-level models (the Tenant registry itself). Mechanics mirror
// the branch hooks exactly:
//   - no active request context -> no scoping (background scripts/migrations),
//   - an explicit tenantId in the filter always wins,
//   - `{ skipTenantScope: true }` as a query/aggregate option is the one
//     sanctioned escape hatch (auth's global-email user lookup at login,
//     public QR-token resolution, platform tooling).
// New documents get tenantId stamped from the context on save.
function applyTenantScoping(schema) {
  function currentTenantId() {
    const ctx = requestContext.get();
    return ctx && ctx.tenantId ? ctx.tenantId : null;
  }

  const findMiddlewares = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndRemove',
    'update',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
  ];

  for (const method of findMiddlewares) {
    schema.pre(method, function tenantScopeQuery() {
      if (this.getOptions && this.getOptions().skipTenantScope) return;

      const tenantId = currentTenantId();
      if (!tenantId) return;

      const filter = this.getFilter ? this.getFilter() : this._conditions;
      if (filter && filter.tenantId === undefined) {
        filter.tenantId = tenantId;
      }
    });
  }

  schema.pre('aggregate', function tenantScopeAggregate() {
    const opts = (this.options || {});
    if (opts.skipTenantScope) return;

    const tenantId = currentTenantId();
    if (!tenantId) return;

    const pipeline = this.pipeline();
    const alreadyScoped = pipeline.some(
      (stage) => stage && stage.$match && stage.$match.tenantId !== undefined
    );
    if (!alreadyScoped) {
      pipeline.unshift({ $match: { tenantId } });
    }
  });

  schema.pre('save', function tenantScopeSave() {
    if (!this.isNew) return;

    // An explicitly-set tenantId wins over the ambient context — audit logs
    // and cross-context provisioning pass it deliberately (e.g. the
    // 'tenant.registered' audit row written from the 'default' fallback
    // context of the public /register endpoint).
    if (this.isModified('tenantId')) return;

    const tenantId = currentTenantId();
    if (!tenantId) return;

    this.tenantId = tenantId;
  });
}

const originalModel = mongoose.model.bind(mongoose);
mongoose.model = function (name, schema, ...rest) {
  if (schema instanceof mongoose.Schema) {
    // Platform-level models (Tenant registry) opt out of tenancy entirely:
    // no tenantId/branchId fields, no scoping hooks.
    if (schema.options && schema.options.tenantScoped === false) {
      return originalModel(name, schema, ...rest);
    }
    tenantPlugin(schema);
    applyTenantScoping(schema);
    if (schema.options && schema.options.branchScoped === true) {
      applyBranchScoping(schema);
    }
  }
  return originalModel(name, schema, ...rest);
};

module.exports = tenantPlugin;
