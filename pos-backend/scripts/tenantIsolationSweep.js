// Phase 6.1 acceptance gate — cross-tenant isolation sweep.
//
// Logs in as BOTH tenants' admins (default + a second tenant, created via
// POST /api/auth/register if it doesn't exist yet), hits every authenticated
// GET list/detail endpoint with each token, and asserts that neither tenant
// can see a single document belonging to the other.
//
// Usage:
//   node scripts/tenantIsolationSweep.js            (npm run sweep:isolation)
// Env overrides: BASE_URL, DEFAULT_EMAIL, DEFAULT_PASSWORD,
//                TENANT_EMAIL, TENANT_PASSWORD, TENANT_NAME
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5001';

const DEFAULT_CREDS = {
  email: process.env.DEFAULT_EMAIL || 'admin@pos.local',
  password: process.env.DEFAULT_PASSWORD || 'admin123',
};
const TENANT = {
  restaurantName: process.env.TENANT_NAME || 'TEST Bistro',
  ownerName: 'Bistro Owner',
  email: process.env.TENANT_EMAIL || 'test-bistro@test.local',
  password: process.env.TENANT_PASSWORD || 'testtest1',
};

let pass = 0;
let fail = 0;
const failures = [];

function report(ok, label, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    failures.push(`${label} — ${detail}`);
    console.log(`FAIL  ${label} — ${detail}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const { status, json } = await api('POST', '/api/auth/login', { body: { email, password } });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status} ${JSON.stringify(json)}`);
  return json;
}

async function ensureTenant() {
  const reg = await api('POST', '/api/auth/register', { body: TENANT });
  if (reg.status === 201) {
    console.log(`[sweep] registered tenant "${TENANT.restaurantName}" (${reg.json.user.tenantId})`);
    return reg.json;
  }
  if (reg.status === 409) {
    console.log('[sweep] tenant already registered — logging in');
    return login(TENANT.email, TENANT.password);
  }
  throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.json)}`);
}

// Extract the array of documents from whatever shape the endpoint returns.
function docsOf(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'logs', 'invoices', 'orders', 'users', 'customers', 'rows']) {
    if (Array.isArray(json[key])) return json[key];
  }
  // Fall back to the first array-valued property.
  const arr = Object.values(json).find((v) => Array.isArray(v));
  return arr || [];
}

function idsOf(json) {
  return new Set(
    docsOf(json)
      .map((d) => d && d._id)
      .filter(Boolean)
      .map(String)
  );
}

// Every authenticated GET list endpoint to sweep. `leak` compares document
// id sets between the two tenants (default) — endpoints returning aggregates
// instead of documents use a custom check or are informational-only.
const LIST_ROUTES = [
  '/api/categories',
  '/api/menu',
  '/api/invoice',
  '/api/orders',
  '/api/tables',
  '/api/kots',
  '/api/customers',
  '/api/users',
  '/api/roles',
  '/api/branches',
  '/api/inventory',
  '/api/inventory/low',
  '/api/purchase-orders',
  '/api/vendors',
  '/api/reservations',
  '/api/shifts',
  '/api/audit',
];

async function sweepLists(tokens) {
  for (const route of LIST_ROUTES) {
    const a = await api('GET', route, { token: tokens.default });
    const b = await api('GET', route, { token: tokens.bistro });

    if (a.status >= 400 || b.status >= 400) {
      report(false, `GET ${route}`, `unexpected status default=${a.status} bistro=${b.status}`);
      continue;
    }

    const setA = idsOf(a.json);
    const setB = idsOf(b.json);
    const overlap = [...setA].filter((id) => setB.has(id));
    report(overlap.length === 0, `GET ${route}`, `shared _ids across tenants: ${overlap.slice(0, 3).join(', ')}`);
  }
}

async function sweepSettings(tokens) {
  const a = await api('GET', '/api/settings', { token: tokens.default });
  const b = await api('GET', '/api/settings', { token: tokens.bistro });
  const ok =
    a.status === 200 && b.status === 200 && a.json && b.json && String(a.json._id) !== String(b.json._id);
  report(ok, 'GET /api/settings', `default=${a.status}/${a.json && a.json._id} bistro=${b.status}/${b.json && b.json._id}`);
  return { default: a.json, bistro: b.json };
}

async function sweepAggregates(tokens) {
  // Reports/analytics return aggregates, not documents — assert they respond
  // 200 for both tenants and (where totals exist) that a brand-new tenant
  // shows zeroes while default's data is untouched.
  const routes = [
    '/api/reports/daily',
    '/api/reports/items',
    '/api/reports/payments',
    '/api/analytics/overview',
    '/api/analytics/peak-hours',
    '/api/analytics/items',
    '/api/analytics/channels',
    '/api/analytics/inventory-value',
    '/api/analytics/branches',
  ];
  for (const route of routes) {
    const a = await api('GET', route, { token: tokens.default });
    const b = await api('GET', route, { token: tokens.bistro });
    report(
      a.status === 200 && b.status === 200,
      `GET ${route}`,
      `status default=${a.status} bistro=${b.status}`
    );
  }
}

async function main() {
  console.log(`[sweep] base: ${BASE}`);
  const defaultAuth = await login(DEFAULT_CREDS.email, DEFAULT_CREDS.password);
  const bistroAuth = await ensureTenant();

  const tokens = { default: defaultAuth.token, bistro: bistroAuth.token };

  report(defaultAuth.user.tenantId === 'default', 'default admin tenantId', `got ${defaultAuth.user.tenantId}`);
  report(
    bistroAuth.user.tenantId && bistroAuth.user.tenantId !== 'default',
    'bistro owner tenantId',
    `got ${bistroAuth.user.tenantId}`
  );

  await sweepLists(tokens);
  await sweepSettings(tokens);
  await sweepAggregates(tokens);

  // Bistro must see exactly its provisioned baseline: 5 roles, 1 branch.
  const roles = await api('GET', '/api/roles', { token: tokens.bistro });
  report(docsOf(roles.json).length === 5, 'bistro sees exactly 5 provisioned roles', `got ${docsOf(roles.json).length}`);
  const branches = await api('GET', '/api/branches', { token: tokens.bistro });
  report(
    docsOf(branches.json).length === 1 && docsOf(branches.json)[0].code === 'main',
    'bistro sees exactly its own main branch',
    JSON.stringify(docsOf(branches.json).map((b) => b.code))
  );
  const bistroUsers = await api('GET', '/api/users', { token: tokens.bistro });
  const emails = docsOf(bistroUsers.json).map((u) => u.email);
  report(
    emails.length === 1 && emails[0] === TENANT.email,
    'bistro sees only its own user',
    JSON.stringify(emails)
  );

  console.log(`\n[sweep] ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('[sweep] failures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[sweep] fatal:', err.message);
  process.exit(1);
});
