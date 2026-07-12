const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveEmailConfig } = require('./emailConfig');

const ENV = {
  provider: 'RESEND',
  apiKey: 'env-resend-key',
  from: 'onboarding@resend.dev',
  frontendUrl: 'http://localhost:5173',
};

test('resolveEmailConfig: no PlatformSettings override -> falls back to env config exactly', () => {
  assert.deepEqual(resolveEmailConfig(ENV, null), ENV);
});

test('resolveEmailConfig: PlatformSettings override with BOTH provider and apiKey -> takes precedence', () => {
  const override = { provider: 'SENDGRID', apiKey: 'sg-live-key', fromAddress: 'no-reply@platform.io' };
  const result = resolveEmailConfig(ENV, override);
  assert.equal(result.provider, 'SENDGRID');
  assert.equal(result.apiKey, 'sg-live-key');
  assert.equal(result.from, 'no-reply@platform.io');
  // frontendUrl always comes from env — it's not part of the operator-facing
  // email provider config.
  assert.equal(result.frontendUrl, ENV.frontendUrl);
});

test('resolveEmailConfig: override missing fromAddress -> falls back to env `from`', () => {
  const override = { provider: 'SENDGRID', apiKey: 'sg-live-key', fromAddress: '' };
  const result = resolveEmailConfig(ENV, override);
  assert.equal(result.from, ENV.from);
});

test('resolveEmailConfig: incomplete override (provider chosen but no apiKey yet) -> ignored, env fallback used', () => {
  const override = { provider: 'SENDGRID', apiKey: '', fromAddress: 'no-reply@platform.io' };
  assert.deepEqual(resolveEmailConfig(ENV, override), ENV);
});

test('resolveEmailConfig: incomplete override (apiKey set but no provider) -> ignored, env fallback used', () => {
  const override = { provider: '', apiKey: 'sg-live-key' };
  assert.deepEqual(resolveEmailConfig(ENV, override), ENV);
});

test('resolveEmailConfig: clearing the override (back to null) -> env fallback resumes exactly as before', () => {
  const override = { provider: 'SENDGRID', apiKey: 'sg-live-key' };
  const withOverride = resolveEmailConfig(ENV, override);
  assert.notDeepEqual(withOverride, ENV);

  const cleared = resolveEmailConfig(ENV, null);
  assert.deepEqual(cleared, ENV);
});
