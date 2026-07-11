const { test } = require('node:test');
const assert = require('node:assert');

const { slugify } = require('../modules/tenants/slug');
const requestContext = require('./requestContext');
const { counterKeySuffix, numberPrefix, currentTenantId } = require('./utils/branchCounter');

test('slugify lowercases and hyphenates', () => {
  assert.strictEqual(slugify('TEST Bistro'), 'test-bistro');
  assert.strictEqual(slugify('  Café  #42! '), 'caf-42');
  assert.strictEqual(slugify('Main Restaurant'), 'main-restaurant');
});

test('slugify collapses consecutive separators and trims hyphens', () => {
  assert.strictEqual(slugify('--A  &  B--'), 'a-b');
  assert.strictEqual(slugify('***'), 'tenant');
  assert.strictEqual(slugify(''), 'tenant');
});

test('counter keys stay backward compatible for default/main', () => {
  requestContext.run({ tenantId: 'default', branchId: 'main' }, () => {
    assert.strictEqual(counterKeySuffix(), '');
    assert.strictEqual(numberPrefix(), '');
  });
});

test('counter keys gain tenant suffix for non-default tenants', () => {
  requestContext.run({ tenantId: 'test-bistro', branchId: 'main' }, () => {
    assert.strictEqual(counterKeySuffix(), '-test-bistro');
    assert.strictEqual(numberPrefix(), 'TEST-BISTRO-');
  });
});

test('counter keys combine tenant and branch suffixes', () => {
  requestContext.run({ tenantId: 'test-bistro', branchId: 'b2' }, () => {
    assert.strictEqual(counterKeySuffix(), '-test-bistro-b2');
    assert.strictEqual(numberPrefix(), 'TEST-BISTRO-B2-');
  });
});

test('no context falls back to default/main (unscoped scripts)', () => {
  assert.strictEqual(currentTenantId(), 'default');
  assert.strictEqual(counterKeySuffix(), '');
  assert.strictEqual(numberPrefix(), '');
});
