const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const User = require('./user.model');
const controller = require('./users.controller');

// Guard: platformAdmin is a cross-tenant super-admin flag that must NEVER be
// settable through any API path. Even when a caller smuggles
// { platformAdmin: true } into the request body, the create/update controllers
// use explicit field lists, so the flag must not reach the persistence layer.
//
// asyncHandler swallows the handler's promise (it doesn't return it), so the
// test resolves a `done` promise from within the mocked persistence method —
// which only runs once the handler reaches it.

afterEach(() => {
  mock.restoreAll();
});

test('users.create ignores platformAdmin in the request body', async () => {
  let received;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  mock.method(User, 'create', async (doc) => {
    received = doc;
    resolve();
    return { toObject: () => ({ ...doc, _id: 'u1' }) };
  });

  const req = {
    body: { name: 'Mallory', email: 'm@x.com', password: 'pw', role: 'r1', platformAdmin: true },
  };
  const res = { status: () => res, json: () => res };
  controller.create(req, res, (e) => {
    throw e;
  });

  await done;
  assert.ok(received, 'User.create was called');
  assert.equal('platformAdmin' in received, false, 'platformAdmin must not be persisted');
});

test('users.update ignores platformAdmin in the request body', async () => {
  let received;
  let resolve;
  const done = new Promise((r) => (resolve = r));

  mock.method(User, 'findByIdAndUpdate', (id, update) => {
    received = update;
    resolve();
    return { select: () => Promise.resolve({ _id: id }) };
  });

  const req = { params: { id: 'u1' }, body: { name: 'Mallory', platformAdmin: true } };
  const res = { status: () => res, json: () => res };
  controller.update(req, res, (e) => {
    throw e;
  });

  await done;
  assert.ok(received, 'User.findByIdAndUpdate was called');
  assert.equal('platformAdmin' in received, false, 'platformAdmin must not be persisted');
});
