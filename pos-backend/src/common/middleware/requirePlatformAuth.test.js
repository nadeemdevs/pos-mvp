const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const config = require('../../config');
const PlatformOperator = require('../../modules/platform/platformOperator.model');
const requirePlatformAuth = require('./requirePlatformAuth');

// Core acceptance test for Phase 6.4a: a normal TENANT-scoped JWT (the shape
// issued by auth.service.js's issueToken — no `scope` claim at all) must be
// flatly rejected by the platform surface. This is what proves a leaked
// restaurant-admin token can never reach /api/platform/*.

function fakeRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

afterEach(() => {
  mock.restoreAll();
});

test('requirePlatformAuth: rejects a tenant-scoped JWT (no scope claim)', async () => {
  const tenantToken = jwt.sign(
    { id: 'u1', name: 'Owner', role: 'Admin', permissions: [], tenantId: 'default' },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

  const req = { headers: { authorization: `Bearer ${tenantToken}` } };
  const res = fakeRes();
  let nextCalled = false;

  await requirePlatformAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, 'next() must never be called for a tenant token');
  assert.equal(res.statusCode, 401);
});

test('requirePlatformAuth: rejects a JWT with an explicit, wrong scope', async () => {
  const token = jwt.sign({ sub: 'op1', scope: 'password-reset' }, config.jwtSecret, { expiresIn: '1h' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = fakeRes();
  let nextCalled = false;

  await requirePlatformAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('requirePlatformAuth: rejects when Authorization header is missing', async () => {
  const req = { headers: {} };
  const res = fakeRes();
  let nextCalled = false;

  await requirePlatformAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('requirePlatformAuth: accepts a valid platform-operator token for an active operator', async () => {
  const token = jwt.sign({ sub: 'op1', scope: 'platform-operator' }, config.jwtSecret, { expiresIn: '1h' });

  mock.method(PlatformOperator, 'findById', async (id) => {
    assert.equal(id, 'op1');
    return { _id: 'op1', name: 'Ops', email: 'ops@platform.local', active: true };
  });

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = fakeRes();
  let nextCalled = false;

  await requirePlatformAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.platformOperator, { id: 'op1', name: 'Ops', email: 'ops@platform.local' });
});

test('requirePlatformAuth: rejects a valid platform-operator token for a DEACTIVATED operator', async () => {
  const token = jwt.sign({ sub: 'op1', scope: 'platform-operator' }, config.jwtSecret, { expiresIn: '1h' });

  mock.method(PlatformOperator, 'findById', async () => ({
    _id: 'op1',
    name: 'Ops',
    email: 'ops@platform.local',
    active: false,
  }));

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = fakeRes();
  let nextCalled = false;

  await requirePlatformAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
