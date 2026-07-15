const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeResolvedBranchId } = require('./tenantContext');

// Phase 6.5 — the actual branch-lock enforcement rule, as a pure function:
// given {isPrivileged, tenantAllowsSwitching, userHomeBranch,
// headerResolvedBranchId} -> the resolved branchId a request should actually
// run against.

test('a branches.manage holder always gets the header-resolved branch, tenant setting irrelevant', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: true,
      tenantAllowsSwitching: false,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'kochi',
    }),
    'kochi'
  );
});

test('locked-down default: a non-privileged user is pinned to their own home branch regardless of header', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: false,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'kochi',
    }),
    'main'
  );
});

test('opt-in escape hatch: tenantAllowsSwitching lets a non-privileged user roam via the header', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: true,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'kochi',
    }),
    'kochi'
  );
});

test('re-locked: once tenantAllowsSwitching flips back off, the header is ignored again', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: false,
      userHomeBranch: 'kochi',
      headerResolvedBranchId: 'main',
    }),
    'kochi'
  );
});

test('single-branch tenant: no header sent, locked user just gets their own (main) branch', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: false,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'main',
    }),
    'main'
  );
});

test('missing userHomeBranch falls back to main', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: false,
      userHomeBranch: undefined,
      headerResolvedBranchId: 'kochi',
    }),
    'main'
  );
});

// Phase 6.6 — "All Branches" sentinel resolution.

test('all-branches: a privileged user sending x-branch-id: all resolves to the literal "all"', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: true,
      tenantAllowsSwitching: false,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'main',
      isAllHeader: true,
    }),
    'all'
  );
});

test('all-branches: the tenant-wide staffCanSwitchBranches opt-in also unlocks "all" for a non-privileged user', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: true,
      userHomeBranch: 'main',
      headerResolvedBranchId: 'main',
      isAllHeader: true,
    }),
    'all'
  );
});

test('all-branches: a locked-down non-privileged user sending x-branch-id: all is still pinned to their own home branch', () => {
  assert.equal(
    computeResolvedBranchId({
      isPrivileged: false,
      tenantAllowsSwitching: false,
      userHomeBranch: 'kochi',
      headerResolvedBranchId: 'main',
      isAllHeader: true,
    }),
    'kochi'
  );
});

const requestContext = require('../requestContext');
const { runWithResolvedBranch } = require('./tenantContext');

test('all-branches: runWithResolvedBranch("all") sets req.branchId to the literal "all" and ALS context to {branchId:null, allBranches:true}', () => {
  const req = { tenantId: 'default' };
  let seenContext;
  runWithResolvedBranch(req, 'all', () => {
    seenContext = requestContext.get();
  });
  assert.equal(req.branchId, 'all');
  assert.deepEqual(seenContext, { tenantId: 'default', branchId: null, allBranches: true });
});

test('all-branches vs no-context-at-all: a plain requestContext.get() outside any run() is undefined, distinct from an all-branches context object', () => {
  // Simulates a background script with no active request context — must not
  // be confused with a live "all branches" request, whose context object
  // exists and carries allBranches:true explicitly.
  assert.equal(requestContext.get(), undefined);
});

test('all-branches: a real branch code still runs through unchanged (allBranches absent from context)', () => {
  const req = { tenantId: 'default' };
  let seenContext;
  runWithResolvedBranch(req, 'kochi', () => {
    seenContext = requestContext.get();
  });
  assert.equal(req.branchId, 'kochi');
  assert.deepEqual(seenContext, { tenantId: 'default', branchId: 'kochi' });
});
