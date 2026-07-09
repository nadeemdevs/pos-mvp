# POS MVP Backend

Billing-only Restaurant POS backend (Mode 1 MVP). Express + MongoDB (Mongoose) + Socket.io.

## Setup

```bash
cp .env.example .env
npm install
```

Edit `.env` if needed:

```
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/pos_mvp
JWT_SECRET=dev-secret-change-me
JWT_EXPIRES_IN=12h
```

## Seed data

Requires a running MongoDB instance (matching `MONGO_URI`):

```bash
npm run seed
```

Creates:
- Roles: `Admin` (all permissions), `Manager` (all except `roles.manage`), `Cashier` (`billing.create`, `billing.view`, `payments.take`)
- Admin user: `admin@pos.local` / `admin123`
- Categories: Beverages, Snacks, Meals, Desserts, each with a few sample menu items (INR, 5% tax)
- A default settings document

## Run

```bash
npm run dev     # nodemon, auto-restart
npm start        # plain node
```

## Auth

All endpoints except `POST /api/auth/login` require `Authorization: Bearer <token>`.

## API

### Auth
- `POST /api/auth/login` `{email, password}` → `{token, user}`
- `GET /api/auth/me` → current user

### Categories
- `GET /api/categories`
- `POST /api/categories` (menu.manage)
- `PUT /api/categories/:id` (menu.manage)
- `DELETE /api/categories/:id` (menu.manage)

### Menu
- `GET /api/menu?category=&search=&active=`
- `GET /api/menu/:id`
- `POST /api/menu` (menu.manage)
- `PUT /api/menu/:id` (menu.manage)
- `DELETE /api/menu/:id` (menu.manage, soft delete: sets `active=false`)

### Billing / Invoices
- `POST /api/invoice` (billing.create) — creates invoice, computes subtotal/tax/total server-side
- `GET /api/invoice?date=&paymentStatus=&status=&page=&limit=` (billing.view)
- `GET /api/invoice/:id` (billing.view)
- `PUT /api/invoice/:id` (billing.create) — update items/discount/customer while PENDING; also used to hold/resume/cancel via `status`

### Payments

**Manual (cash/UPI) — unchanged, live:**
- `POST /api/payments/manual` (payments.take) `{invoiceId, method: 'CASH'|'UPI', amount, reference?}` — records the payment and marks the invoice `PAID`/`CLOSED` synchronously.

**Card-terminal lifecycle (Phase 2):**
- `POST /api/payments/initiate` (payments.take) `{invoiceId, provider}` — `provider` must be one of `settings.paymentProviders.enabled` (e.g. `MOCK`, `PINELABS`, `WORLDLINE`). Validates the invoice is `paymentStatus: PENDING`. **Idempotent**: if a payment for this invoice is already `INITIATED`/`PROCESSING`, that same payment is returned with `200` instead of creating a duplicate. Otherwise creates a `Payment` (`method: 'CARD'`), calls the provider's `initiatePayment`, registers it with the in-process poller, emits `payment.updated`, and responds `201 {payment}`.
- `GET /api/payments/:id` (payments.take) — returns the payment. If it is still `INITIATED`/`PROCESSING`, first calls the provider's `getStatus` and applies the result (via the shared `applyStatus` helper) before responding, so a client polling this endpoint gets an up-to-date status even if the background poller hasn't ticked yet.
- `POST /api/payments/:id/cancel` (payments.take) — only valid while `INITIATED`/`PROCESSING`; calls the provider's `cancelPayment`, sets `CANCELLED`, emits `payment.updated`.
- `POST /api/payments/callback/:provider` — **no auth**, vendor webhook. Looks up the provider adapter, calls `verifyCallback(req, config)` (rejects with `401` on a bad/missing signature), finds the payment by the reference in the payload, re-derives the authoritative status via `getStatus`, and applies it. `POST /api/payments/callback` (provider taken from the request body) is kept as a trivial alias for backward compatibility.

#### Card payment lifecycle

```
cashier                 POS backend                         card terminal / vendor
  |  POST /initiate           |                                       |
  |--------------------------->|  create Payment(INITIATED)           |
  |                            |  provider.initiatePayment() -------->|
  |                            |<---------------- reference, PROCESSING
  |                            |  save + register with poller          |
  |<---- 201 {payment} --------|                                       |
  |                            |                                       |
  |                     [every 3s, up to 120s]                        |
  |                            |  provider.getStatus() --------------->|
  |                            |<----------------- SUCCESS/FAILED/... -|
  |                            |  applyStatus() -> Payment + Invoice   |
  |                            |  emit socket 'payment.updated'        |
  |                            |  (SUCCESS also emits 'invoice.paid')  |
  |                            |                                       |
  |  GET /payments/:id  ------>|  (also nudges getStatus if still      |
  |<---- {payment} ------------|   in-flight)                          |
  |                            |                                       |
  |  [or] vendor webhook ------------------------------------------->  |
  |                            |  POST /callback/:provider             |
  |                            |  verifyCallback() -> applyStatus()    |
  |                            |                                       |
  | POST /:id/cancel --------->|  provider.cancelPayment() ----------->|
  |<---- {payment: CANCELLED}--|                                       |
```

`applyStatus` (in `payments.service.js`) is the single choke-point for status transitions: it is idempotent (a payment already in a terminal status — `SUCCESS`/`FAILED`/`CANCELLED`/`TIMEOUT` — is left alone on further calls, enforced atomically so a webhook and the poller can't double-process), never trusts client-supplied amounts (the invoice's own `total` is always used), and on `SUCCESS` mirrors exactly what the manual flow does: `invoice.paymentStatus = 'PAID'`, `paymentMethod`, `paymentTransactionId`, `status = 'CLOSED'`.

On server boot, any payment left `INITIATED`/`PROCESSING` from a previous process (e.g. a restart mid-transaction) is automatically re-registered with the poller (`poller.resumeAll()` in `src/server.js`).

#### `settings.paymentProviders`

```json
{
  "enabled": ["MOCK"],
  "mock":     { "delayMs": 5000, "outcome": "SUCCESS" },
  "pinelabs": { "merchantId": "", "securityToken": "", "storeId": "", "clientId": "", "imei": "", "baseUrl": "https://www.plutuscloudserviceuat.in:8201" },
  "worldline":{ "merchantCode": "", "terminalId": "", "securityToken": "", "baseUrl": "" }
}
```

- `enabled` — which card providers cashiers may pass to `POST /api/payments/initiate`.
- `mock` — only used by the `MOCK` provider. `outcome` can be `SUCCESS`, `FAILED`, or `TIMEOUT` (stays `PROCESSING` forever, so the poller's 120s ceiling ends it) — handy for QA without real hardware.
- `pinelabs` / `worldline` — merchant credentials for the real terminal integrations. **`MOCK` is for development only. `PINELABS` and `WORLDLINE` require real merchant credentials from the payment provider before they will work** — until configured, requests to the vendor will fail and the poller will keep retrying (status stays `PROCESSING`) rather than falsely reporting success or failure.

`PUT /api/settings` accepts a partial `paymentProviders` object — e.g. `{"paymentProviders":{"mock":{"outcome":"FAILED"}}}` only touches `mock.outcome` and leaves `delayMs`, `pinelabs`, `worldline`, etc. untouched.

**Implementation notes on the two real providers:**
- `PineLabsProvider` targets the Plutus Smart "Cloud Based Integration" API (`UploadBilledTransaction` / `GetCloudBasedTxnStatus` / `CancelTransaction`). It's poll-based by nature (no merchant webhook in that product line), so `verifyCallback` is intentionally left unimplemented — `POST /api/payments/callback/PINELABS` returns `501`.
- `WorldlineProvider` implements the generic shape (initiate/status/cancel POSTs, HMAC-SHA512-signed) against a **placeholder** endpoint layout (all paths live in one `CONFIG` block at the top of `WorldlineProvider.js`) and a `verifyCallback` that checks an `x-worldline-signature` HMAC header against the raw request body. **The exact paths and payload shape must be confirmed against the merchant's actual Worldline integration document before production use.**

### Reports
- `GET /api/reports/daily?date=YYYY-MM-DD` (reports.view)
- `GET /api/reports/items?from=&to=` (reports.view)
- `GET /api/reports/payments?date=` (reports.view)

### Users
- `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` (users.manage; password hashed with bcrypt, never returned)

### Roles
- `GET /api/roles`, `GET /api/roles/:id`, `POST /api/roles`, `PUT /api/roles/:id`, `DELETE /api/roles/:id` (roles.manage, Admin only)

### Settings
- `GET /api/settings`
- `PUT /api/settings` (settings.manage)

## Permission strings

`billing.create`, `billing.view`, `menu.manage`, `reports.view`, `users.manage`, `roles.manage`, `settings.manage`, `payments.take`.

`Admin` role bypasses permission checks entirely.

## Realtime

Socket.io server initialized in `src/server.js`.
- `invoice.paid` `{invoiceId, invoiceNumber, total, paymentMethod}` — emitted whenever a payment (manual or card) succeeds and the invoice is marked `PAID`.
- `payment.updated` `{paymentId, invoiceId, status, invoiceNumber}` — emitted on every card-payment status transition (`initiate`, poller ticks, callback, cancel), so a POS screen can show live "processing → approved/declined" status.
