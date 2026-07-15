const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isResetTokenInvalidated, isVerifyTokenStale } = require('./auth.tokenInvalidation');

test('isResetTokenInvalidated: no passwordChangedAt -> not invalidated', () => {
  assert.equal(isResetTokenInvalidated(null, Math.floor(Date.now() / 1000)), false);
});

test('isResetTokenInvalidated: password changed AFTER token issued -> invalidated', () => {
  const tokenIat = Math.floor(Date.now() / 1000) - 60; // issued a minute ago
  const passwordChangedAt = new Date(); // changed just now
  assert.equal(isResetTokenInvalidated(passwordChangedAt, tokenIat), true);
});

test('isResetTokenInvalidated: password changed BEFORE token issued -> still valid', () => {
  const passwordChangedAt = new Date(Date.now() - 60_000); // changed a minute ago
  const tokenIat = Math.floor(Date.now() / 1000); // issued now (after the change)
  assert.equal(isResetTokenInvalidated(passwordChangedAt, tokenIat), false);
});

test('isResetTokenInvalidated: password changed AT THE SAME SECOND as token issuance -> invalidated (>=, not just >)', () => {
  // This is the realistic case: the request that consumes a reset token sets
  // passwordChangedAt within the same wall-clock second the token was
  // signed, since the whole round trip is milliseconds. A strict > here
  // would let the just-used token be replayed indefinitely.
  const now = Math.floor(Date.now() / 1000);
  const passwordChangedAt = new Date(now * 1000);
  assert.equal(isResetTokenInvalidated(passwordChangedAt, now), true);
});

test('isResetTokenInvalidated: a token freshly reused immediately after consuming it -> rejected', () => {
  // Regression for the same-second replay bug: mint a token, "consume" it
  // (passwordChangedAt = now, same second), then check the SAME token again.
  const tokenIat = Math.floor(Date.now() / 1000);
  const passwordChangedAt = new Date(tokenIat * 1000 + 5); // 5ms later, same second
  assert.equal(isResetTokenInvalidated(passwordChangedAt, tokenIat), true);
});

test('isVerifyTokenStale: same email (case-insensitive) -> not stale', () => {
  assert.equal(isVerifyTokenStale('Owner@Example.com', 'owner@example.com'), false);
});

test('isVerifyTokenStale: different email -> stale', () => {
  assert.equal(isVerifyTokenStale('old@example.com', 'new@example.com'), true);
});
