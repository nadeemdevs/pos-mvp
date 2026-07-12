const { test } = require('node:test');
const assert = require('node:assert/strict');

const requestContext = require('../requestContext');
const requireSpecificBranch = require('./requireSpecificBranch');

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

test('rejects a non-GET request while allBranches:true is in effect', () => {
  const res = makeRes();
  let nextCalled = false;
  requestContext.run({ tenantId: 'default', branchId: null, allBranches: true }, () => {
    requireSpecificBranch({ method: 'POST' }, res, () => {
      nextCalled = true;
    });
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Select a specific branch to perform this action.');
});

test('allows a GET request through even while allBranches:true is in effect', () => {
  const res = makeRes();
  let nextCalled = false;
  requestContext.run({ tenantId: 'default', branchId: null, allBranches: true }, () => {
    requireSpecificBranch({ method: 'GET' }, res, () => {
      nextCalled = true;
    });
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('allows a non-GET request through when a real branch is active (no allBranches flag)', () => {
  const res = makeRes();
  let nextCalled = false;
  requestContext.run({ tenantId: 'default', branchId: 'kochi' }, () => {
    requireSpecificBranch({ method: 'POST' }, res, () => {
      nextCalled = true;
    });
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('allows a non-GET request through when there is no active request context at all (e.g. a script)', () => {
  const res = makeRes();
  let nextCalled = false;
  requireSpecificBranch({ method: 'POST' }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
