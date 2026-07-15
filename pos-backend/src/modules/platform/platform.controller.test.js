const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mergeFeatures } = require('./platform.controller');

// Phase 6.4b — the non-clobbering partial merge used by
// PUT /api/platform/tenants/:slug/features. This is the correctness-critical
// piece of the whole feature: a bug here could silently corrupt or wipe a
// tenant's feature flags via the cross-tenant write path.

test('mergeFeatures: only applies keys present in the incoming partial', () => {
  const current = {
    dineIn: true,
    inventory: false,
    crm: true,
    loyalty: false,
    analytics: false,
    reservations: false,
    shifts: false,
    onlineOrdering: false,
  };

  const merged = mergeFeatures(current, { inventory: true });

  assert.equal(merged.inventory, true);
  // Every sibling flag must be untouched.
  assert.equal(merged.dineIn, true);
  assert.equal(merged.crm, true);
  assert.equal(merged.loyalty, false);
  assert.equal(merged.analytics, false);
  assert.equal(merged.reservations, false);
  assert.equal(merged.shifts, false);
  assert.equal(merged.onlineOrdering, false);
});

test('mergeFeatures: ignores keys not in the known feature set', () => {
  const current = { dineIn: false, crm: true };
  const merged = mergeFeatures(current, { notARealFlag: true });

  assert.equal(merged.notARealFlag, undefined);
  assert.equal(merged.dineIn, false);
  assert.equal(merged.crm, true);
});

test('mergeFeatures: an empty incoming object leaves everything unchanged', () => {
  const current = { dineIn: true, inventory: true, crm: false };
  const merged = mergeFeatures(current, {});

  assert.deepEqual(merged, current);
});

test('mergeFeatures: supports mongoose subdocuments via toObject()', () => {
  const current = {
    toObject: () => ({ dineIn: false, crm: true, loyalty: false }),
  };
  const merged = mergeFeatures(current, { loyalty: true });

  assert.equal(merged.loyalty, true);
  assert.equal(merged.dineIn, false);
  assert.equal(merged.crm, true);
});

test('mergeFeatures: multiple keys in one call only touch those keys', () => {
  const current = {
    dineIn: false,
    inventory: false,
    crm: true,
    loyalty: false,
    analytics: false,
    reservations: false,
    shifts: false,
    onlineOrdering: false,
  };

  const merged = mergeFeatures(current, { inventory: true, analytics: true });

  assert.equal(merged.inventory, true);
  assert.equal(merged.analytics, true);
  assert.equal(merged.dineIn, false);
  assert.equal(merged.crm, true);
  assert.equal(merged.loyalty, false);
  assert.equal(merged.reservations, false);
  assert.equal(merged.shifts, false);
  assert.equal(merged.onlineOrdering, false);
});
