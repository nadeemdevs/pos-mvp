const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const Tenant = require('./tenant.model');
const tenantStatus = require('./tenantStatus');

// Build a chainable stub matching Tenant.findOne(...).select(...).setOptions(...).lean()
function findOneReturning(doc) {
  const chain = {
    select() {
      return chain;
    },
    setOptions() {
      return chain;
    },
    lean() {
      return Promise.resolve(doc);
    },
  };
  return chain;
}

beforeEach(() => {
  tenantStatus._clear();
});

afterEach(() => {
  mock.restoreAll();
});

test('getStatus returns SUSPENDED for a suspended tenant', async () => {
  mock.method(Tenant, 'findOne', () => findOneReturning({ status: 'SUSPENDED' }));
  assert.equal(await tenantStatus.getStatus('zz-diner'), 'SUSPENDED');
});

test('getStatus treats an unknown tenant (no row) as ACTIVE', async () => {
  mock.method(Tenant, 'findOne', () => findOneReturning(null));
  assert.equal(await tenantStatus.getStatus('ghost'), 'ACTIVE');
});

test('getStatus caches within the TTL (single DB read)', async () => {
  const fn = mock.method(Tenant, 'findOne', () => findOneReturning({ status: 'ACTIVE' }));
  await tenantStatus.getStatus('acme');
  await tenantStatus.getStatus('acme');
  await tenantStatus.getStatus('acme');
  assert.equal(fn.mock.callCount(), 1);
});

test('invalidate forces a fresh DB read (suspension bites immediately)', async () => {
  let status = 'ACTIVE';
  const fn = mock.method(Tenant, 'findOne', () => findOneReturning({ status }));

  assert.equal(await tenantStatus.getStatus('acme'), 'ACTIVE');
  assert.equal(fn.mock.callCount(), 1);

  // Flip the underlying status + invalidate — next read must hit the DB again.
  status = 'SUSPENDED';
  tenantStatus.invalidate('acme');

  assert.equal(await tenantStatus.getStatus('acme'), 'SUSPENDED');
  assert.equal(fn.mock.callCount(), 2);
});

test('getStatus fails open (ACTIVE) when the DB read throws and nothing cached', async () => {
  mock.method(Tenant, 'findOne', () => {
    throw new Error('db down');
  });
  assert.equal(await tenantStatus.getStatus('acme'), 'ACTIVE');
});
