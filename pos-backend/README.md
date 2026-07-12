# POS MVP Backend

Restaurant POS backend supporting two modes. Express + MongoDB (Mongoose) + Socket.io.
- **Mode 1** — counter billing (`/api/invoice`, `/api/payments`), unchanged since the MVP.
- **Mode 2** — dine-in table service (`/api/tables`, `/api/orders`, `/api/kots`, `/api/print`), added in Phase 4. Gated for UI purposes by `settings.features.dineIn` (the APIs themselves are always available).
- **Phase 5.1 (ERP core)** — multi-tenant/branch scaffolding, an in-process event bus, an audit trail, and inventory/recipes/purchasing (`/api/branches`, `/api/audit`, `/api/inventory`, `/api/vendors`, `/api/purchase-orders`). See [Phase 5.1: ERP core](#phase-51-erp-core) below.
- **Phase 5.3** — guest-facing QR/online ordering (`/api/public/*`), delivery-partner webhook stubs (`/api/delivery/webhook/:partner`), an analytics module (`/api/analytics/*`), and real branch-data isolation (previously the branch fields existed but weren't enforced in queries). See [Phase 5.3](#phase-53--qronline-ordering-delivery-webhooks-analytics-branch-hardening) below.
- **Phase 6.1** — true multi-tenancy: isolated per-tenant data, public tenant signup, per-tenant socket rooms. See [Phase 6.1](#phase-61-true-multi-tenancy) below.
- **Phase 6.2** — cross-tenant platform-admin surface (`/api/platform/*`), suspension enforced on every authenticated request + live sockets, per-tenant+IP public rate limiting, and production config hardening. See [Phase 6.2](#phase-62-platform-admin-suspension-hardening-abuse-guards) below. **Superseded by Phase 6.4a** — the `User.platformAdmin` mechanism described there has been retired entirely.
- **Phase 6.4a** — replaces Phase 6.2's `platformAdmin` flag with a wholly separate `PlatformOperator` identity/login, a platform settings singleton (email-provider override + maintenance mode), and an honestly-labeled GMV dashboard. See [Phase 6.4a](#phase-64a-platform-operator-identity-platform-settings-gmv-dashboard) below.

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
CORS_ORIGIN=*            # comma-separated origin list in prod; '*' in dev
NODE_ENV=               # set to 'production' in prod
```

> **Production hardening (Phase 6.2):** when `NODE_ENV=production`, the server **refuses to boot** if `JWT_SECRET` is still the dev default `dev-secret-change-me` — set a strong secret first. `CORS_ORIGIN` restricts allowed origins (both REST and Socket.IO); leave it `*` in dev. With `NODE_ENV` unset, local behavior is unchanged.

## Seed data

Requires a running MongoDB instance (matching `MONGO_URI`):

```bash
npm run seed
```

Creates:
- Roles: `Admin` (all permissions), `Manager` (all except `roles.manage`, `audit.view` and `branches.manage` — see Permission strings below), `Cashier` (`billing.create`, `billing.view`, `payments.take`, `orders.take`), `Waiter` (`orders.take`), `Kitchen` (`kitchen.view`)
- Admin user: `admin@pos.local` / `admin123`
- Categories: Beverages, Snacks, Meals, Desserts, each with a few sample menu items (INR, 5% tax)
- A default settings document
- Branch: `main` / "Main Branch" (see Phase 5.1 below)

### Tenant backfill migration

Phase 5.1 added a global `tenantId`/`branchId` plugin (defaults `'default'`/`'main'`) to every Mongoose schema. Documents created before that plugin existed predate those fields — backfill them once (safe to re-run; only touches documents missing `tenantId`):

```bash
npm run migrate:tenant
```

## Run

```bash
npm run dev     # nodemon, auto-restart
npm start        # plain node
```

## Tests

```bash
npm test   # node:test — FSM transitions + split-billing math, no DB required
```

## Auth

All endpoints except `POST /api/auth/login`, `POST /api/auth/register`, `/api/public/*`, and the payment/delivery webhook callbacks require `Authorization: Bearer <token>`. The JWT carries the user's `tenantId` (Phase 6.1) — see "True multi-tenancy" below.

## API

### Auth
- `POST /api/auth/login` `{email, password}` → `{token, user}` (403 if the user's tenant is SUSPENDED)
- `POST /api/auth/register` `{restaurantName, ownerName, email, password}` → `{token, user}` — public tenant signup (Phase 6.1)
- `GET /api/auth/me` → current user (includes `tenantId`)

### Categories
- `GET /api/categories`
- `POST /api/categories` (menu.manage)
- `PUT /api/categories/:id` (menu.manage)
- `DELETE /api/categories/:id` (menu.manage)

### Menu
- `GET /api/menu?category=&search=&active=`
- `GET /api/menu/:id`
- `POST /api/menu` (menu.manage) — accepts `modifiers: [{name, price}]`
- `PUT /api/menu/:id` (menu.manage) — same, `modifiers` replaces the array when sent
- `DELETE /api/menu/:id` (menu.manage, soft delete: sets `active=false`)

**Modifiers:** each menu item may define `modifiers: [{name, price}]` (e.g. `{"name":"Extra Ghee","price":10}`). When an order line references a modifier by name (`POST /api/orders/:id/items`), the price is always taken from the menu item's definition server-side — the client only sends the modifier `name`.

### Billing / Invoices
- `POST /api/invoice` (billing.create) — creates invoice, computes subtotal/tax/total server-side. Body accepts `items`, `customer: {name, phone}`, `note` (label for held bills), and discount fields (see below).
- `GET /api/invoice?date=&paymentStatus=&status=&page=&limit=` (billing.view)
- `GET /api/invoice/:id` (billing.view)
- `PUT /api/invoice/:id` (billing.create) — update items/discount/customer/note while PENDING; also used to hold/resume/cancel via `status`

**Discounts:** send `discountType: 'FLAT'|'PERCENT'` + `discountValue` (number ≥ 0). `FLAT` is an absolute amount; `PERCENT` is a percentage of `subtotal + tax`. The server computes and persists the absolute `discount` amount (rounded to 2dp). Legacy clients may instead send a plain `discount` number — it is treated as `FLAT` for backward compatibility. Server-side enforcement: the discount can never exceed `subtotal + tax` (rejected `400`), and for non-`Admin` users it can never exceed `settings.discounts.maxPercent` of `subtotal + tax` (rejected `400` with `Discount exceeds the maximum allowed X%`); `Admin` bypasses the percent cap.

**Rounding:** when `settings.rounding.enabled` is true, the invoice total is rounded to the nearest `settings.rounding.nearest` (e.g. `1` = whole rupees) and the delta is stored on the invoice as `roundOff` (can be negative). `total = subtotal + tax - discount + roundOff`.

**Customer linkage:** if `customer.phone` is present (non-empty) on create or update, the server finds-or-creates a `Customer` by phone (updating the name if a non-empty one is supplied, without clobbering an existing customer's name with a blank one) and sets `invoice.customerId`. If `customer` is omitted from the update payload, the existing link is left untouched; if it's present but empty/phoneless, `customerId` is cleared. The embedded `customer: {name, phone}` snapshot is kept as-is for receipts.

**Mode 2 (dine-in) invoices:** an invoice created via `POST /api/orders/:id/bill` carries `orderId`/`orderNumber` and is otherwise a completely normal invoice (same `subtotal`/`tax`/`discount`/`total` computation, via the shared `billing.service.buildInvoice`). Mode 1 invoices (`POST /api/invoice`) never set these fields and behave exactly as before.

---

## Dine-in (Mode 2): Tables / Orders / KOTs / Printing

Order is the primary entity — items are embedded in the order document (no separate line-item collection). Two independent finite-state machines govern the flow (`src/common/fsm.js`, `createMachine(transitions)` — `assertTransition` throws a `400` with `Invalid transition FROM → TO`):

**Order FSM** (`src/modules/orders/order.machine.js`):
```
OPEN ──┬──────────────► BILL_REQUESTED ──► INVOICED ──► PAID ──► CLOSED
       ├──────────────► INVOICED   (counter-flow shortcut, no unfired items)
       └──────────────► CANCELLED
BILL_REQUESTED ────────► CANCELLED
```
`CANCELLED`/`CLOSED` are terminal. Table `status` (`FREE`/`OCCUPIED`/`BILLED`) is derived/denormalized state kept on the `Table` doc for cheap floor-plan reads — not a formal FSM.

**KOT FSM** (`src/modules/kots/kot.machine.js`):
```
NEW ──► PREPARING ──► READY ──► SERVED
NEW, PREPARING ──► CANCELLED
```

### Tables — `src/modules/tables/`
- `GET /api/tables` (`orders.take` or `tables.manage` or `billing.create`) — sorted by `zone, name`; each occupied table includes `order: {_id, orderNumber, guestCount, status, itemCount, total}`. Includes `qrToken` (see Phase 5.3 below) for any caller with read access — no separate gating.
- `POST /api/tables` `{name, zone?, capacity?}` (`tables.manage`)
- `PUT /api/tables/:id` (`tables.manage`) — `400` unless the table is `FREE`
- `DELETE /api/tables/:id` (`tables.manage`) — `400` unless the table is `FREE`
- `POST /api/tables/:id/transfer` `{toTableId}` (`tables.manage` or `orders.take`) — moves the current order to the target table; `400` if source is `FREE` or target isn't `FREE`. Emits `table.updated` ×2 + `order.updated`.
- `POST /api/tables/:id/merge` `{fromTableId}` (`tables.manage` or `orders.take`) — appends `fromTableId`'s order items (fired and unfired) into `:id`'s order, recomputes totals, cancels the source order (`note: 'Merged into <destOrderNumber>'`), frees the source table. `400` unless both tables are `OCCUPIED` with `OPEN` orders. Any already-fired KOTs for the moved items are re-pointed (`orderId`/`orderNumber`/`tableId`/`tableName`) to the destination order/table, so a later cancel/KDS lookup on the destination order finds them. Emits `table.updated` ×2 + `order.updated` ×2.
- `POST /api/tables/:id/qr-token` (`tables.manage`) — (re)generates the table's `qrToken` (`crypto.randomBytes(16).toString('hex')`), invalidating any previously-printed QR sticker. Returns `{qrToken, table}`.

### Orders — `src/modules/orders/`
All require `orders.take` unless noted (Admin always bypasses).
- `POST /api/orders` `{tableId, guestCount?, type?: 'DINE_IN'|'TAKEAWAY'}` — `409` if the table isn't `FREE`. Creates an `OPEN` order (`orderNumber: ORD-YYYYMMDD-XXXX`), sets the table `OCCUPIED`. Emits `order.created` + `table.updated`.
- `GET /api/orders?status=&tableId=&active=true&page=&limit=` — `active=true` filters out `PAID`/`CLOSED`/`CANCELLED`. Newest first, `{items, total, page}`.
- `GET /api/orders/:id`
- `POST /api/orders/:id/items` `{items: [{menuItemId, qty, modifiers?: [{name}], note?}]}` — only while `OPEN`. Menu item must exist and be `active`; each modifier is matched by name against the menu item's own `modifiers` (`400` if unknown) and its price is taken from the menu definition, never the client. Recomputes totals, emits `order.updated`.
- `PUT /api/orders/:id/items/:itemId` `{qty}` / `DELETE /api/orders/:id/items/:itemId` — only for **unfired** items (`kotId: null`) while the order is `OPEN`; `400` otherwise.
- `POST /api/orders/:id/kot` — fires every currently-unfired item onto a new KOT (`400 'No unfired items'` if none), stamps those items' `kotId`. Emits `kot.created` (kitchen + floor) + `order.updated`. Returns `{kot}`.
- `POST /api/orders/:id/request-bill` — `OPEN`/`BILL_REQUESTED`→`BILL_REQUESTED`; `400` if any unfired items remain (fire or remove them first). Sets the table `BILLED`. Emits `order.updated` + `table.updated`.
- `POST /api/orders/:id/bill` (`billing.create`) `{mode}` — see **Split billing** below. Moves the order to `INVOICED` (allowed directly from `OPEN` too, as long as there are no unfired items — saves the counter flow an extra round trip). Emits `invoice.created` per invoice + `order.updated`.
- `POST /api/orders/:id/cancel` — only from `OPEN`/`BILL_REQUESTED` and only if no invoices exist yet. Cancels every non-`SERVED` KOT on the order, frees the table. Emits `kot.updated` per KOT + `order.closed` + `table.updated`.

**Totals:** recomputed server-side on every mutation — line total = `(price + Σ modifier prices) × qty`, tax = `lineTotal × taxRate / 100`, everything rounded to 2dp (`orders.service.computeOrderTotals`).

### Split billing (`src/modules/orders/split.js`)
Pure, DB-free functions (unit tested in `split.test.js`), used by `POST /api/orders/:id/bill`:
- `{mode: 'FULL'}` — one invoice with every order item.
- `{mode: 'ITEMS', splits: [[itemId, ...], [itemId, ...]]}` → `splitByItems(orderItems, splits)` — every item id must appear in **exactly one** group and every item must be covered, or it throws `400`. One invoice per group.
- `{mode: 'EQUAL', ways: N}` → `splitEqually(order, ways)` — N invoices, each a single synthetic line `{name: "Share i/N — <orderNumber>", qty: 1, price, taxRate}`. The **last** share absorbs whatever rounding remainder is left from `round2`-ing the first N-1 shares (both subtotal and tax), so the sum of the resulting invoice totals is exactly equal to the order's total — no drift, asserted in `split.test.js` including on subtotals that don't divide evenly.

Invoices are created exclusively through `billingService.createFromOrder(order, items, {label, cashier})` (`src/modules/billing/billing.service.js`), which reuses the exact same `buildInvoice` computation path as `POST /api/invoice`. Order-item modifiers are folded into the invoice line: price = `price + Σ modifier prices`, name = `"<item name> + <modifier names...>"` (e.g. `"Veg Thali + Extra Ghee"`).

### KOTs — `src/modules/kots/`
- `GET /api/kots?statuses=NEW,PREPARING,READY` (`kitchen.view` or `orders.take`) — comma-separated list, defaults to `NEW,PREPARING,READY` for the KDS view. Oldest first.
- `POST /api/kots/:id/status` `{status}` (`kitchen.view` or `orders.take`) — FSM-validated; appends `{status, at}` to `statusTimeline`. Emits `kot.updated` (kitchen + floor), plus `kot.ready` when the new status is `READY`. When a KOT reaches `SERVED` and every KOT on its order is now `SERVED`/`CANCELLED`, emits `order.updated` too (kitchen progress is derived, not stored on the order).
- `GET /api/kots/:id/print` (`kitchen.view` or `orders.take`) — dispatches through the printing module (below).

KOT items are an **immutable snapshot** at fire time (`name`, `qty`, `modifiers: [{name}]`, `note`) — later menu or order edits never retroactively change a ticket already in the kitchen.

### Printing — `src/modules/printing/`
Provider pattern mirroring the payments module (`PrinterProvider` base, `PrinterFactory.get('BROWSER'|'ESCPOS_NETWORK')`):
- `BrowserPrintProvider` (default) — returns `{printed: false, payload}`; the client renders/prints the payload itself.
- `EscPosNetworkProvider` — builds a plain ESC/POS byte buffer (init, centered bold header, item lines, cut) and sends it over a raw TCP socket (`node:net`) to `config.host:config.port` (default `9100`), 3s connect/write timeout, any failure → `502 {message}`. **Untested against real hardware** — only exercised via buffer construction; byte-level details (codepage, cut command) may need adjusting for a specific printer model.
- `POST /api/print/test` `{target: 'kot'|'receipt'}` — sends a small test ticket through whichever provider is configured at `settings.printing.<target>`.

`settings.printing`: `{kot: {provider, host, port}, receipt: {provider, host, port}}`, deep-merged on `PUT /api/settings` the same way `paymentProviders` is (touching `printing.kot.host` alone leaves `printing.kot.port` and `printing.receipt` untouched).

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

**Dine-in settlement:** both `POST /api/payments/manual` and `applyStatus`'s `SUCCESS` branch call the same shared hook, `ordersService.settleInvoicePaid(invoice)` (`src/modules/orders/orders.service.js`), immediately after marking an invoice `PAID`. It's a no-op for Mode 1 invoices (`invoice.orderId` unset). For Mode 2, once **every** invoice on `invoice.orderId` is `PAID` (covers `FULL`/`ITEMS`-split/`EQUAL`-split alike — a split-billed order only closes once all of its invoices clear), the order moves straight to `CLOSED` in one save (FSM-validated as `INVOICED→PAID→CLOSED`), `paidAt` is stamped, and its table is freed (`FREE`, `currentOrderId: null`). Emits `payment.completed {invoiceId, orderId}` + `order.closed` + `table.updated`.

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
- `GET /api/reports/discounts?from=&to=` (reports.view) — `{totalDiscount, invoiceCount, invoices: [{invoiceNumber, date, cashierName, subtotal, discount, discountType, discountValue, total}]}`; only invoices with `discount > 0`, excludes `CANCELLED`.
- `GET /api/reports/cancelled?from=&to=` (reports.view) — `{count, totalValue, invoices: [{invoiceNumber, date, cashierName, total}]}`; invoices with `status: CANCELLED`.
- `GET /api/reports/tax?from=&to=` (reports.view) — `{totalTax, taxableSales, byRate: [{taxRate, taxableAmount, tax}]}`; grouped from line items of `PAID` invoices.

### Customers
- `GET /api/customers?search=&page=&limit=` (billing.create or customers.manage) — `search` matches name or phone (case-insensitive) → `{items, total, page}`
- `GET /api/customers/:id` (billing.create or customers.manage) — `{customer, stats: {invoiceCount, totalSpent, lastVisit}}` computed over that customer's `PAID` invoices
- `GET /api/customers/:id/invoices?page=&limit=` (billing.create or customers.manage) — that customer's invoices, newest first
- `POST /api/customers` (billing.create or customers.manage) `{name, phone, email?, notes?}`
- `PUT /api/customers/:id` (customers.manage)
- `DELETE /api/customers/:id` (customers.manage)

### Users
- `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` (users.manage; password hashed with bcrypt, never returned)

### Roles
- `GET /api/roles`, `GET /api/roles/:id`, `POST /api/roles`, `PUT /api/roles/:id`, `DELETE /api/roles/:id` (roles.manage, Admin only)

### Settings
- `GET /api/settings`
- `PUT /api/settings` (settings.manage) — accepts a partial body; `discounts` and `rounding` sub-objects are shallow-merged the same way `paymentProviders` is (only the keys you send are touched):
  - `discounts: { maxPercent: 100, presets: [{label, type: 'FLAT'|'PERCENT', value}] }` — `maxPercent` is the server-side cap enforced on invoice discounts for non-`Admin` users; `presets` is a client-facing list of quick-pick discounts.
  - `rounding: { enabled: false, nearest: 1 }` — when `enabled`, invoice totals are rounded to the nearest `nearest` and the delta is stored on the invoice as `roundOff`.
  - `printing: { kot: {provider: 'BROWSER'|'ESCPOS_NETWORK', host, port}, receipt: {...} }` — see Printing above.
  - `features: { dineIn: false, inventory: false, crm: true, loyalty: false, analytics: false }` — UI feature gates only; the underlying APIs (`/api/tables`, `/api/orders`, `/api/kots`, `/api/print`, `/api/inventory`, `/api/purchase-orders`, etc.) stay available regardless of these flags.

## Permission strings

`billing.create`, `billing.view`, `menu.manage`, `reports.view`, `users.manage`, `roles.manage`, `settings.manage`, `payments.take`, `customers.manage`, `tables.manage`, `orders.take`, `kitchen.view`, `inventory.manage`, `purchasing.manage`, `branches.manage`, `audit.view`, `loyalty.manage`, `reservations.manage`, `shifts.manage`, `analytics.view`.

`Admin` role bypasses permission checks entirely (and has every permission in the seed). `Manager` has all of the above **except** `roles.manage`, `branches.manage`, and `audit.view` — the audit trail and branch administration are Admin-only; Manager does get `inventory.manage` and `purchasing.manage`. `Cashier` has `billing.create`, `billing.view`, `payments.take`, `orders.take` — which is also enough to list/read/create customers (see Customers above), since cashiers look up and create customers mid-sale. `Waiter` has `orders.take` only (take orders, fire KOTs, request bills — no billing/settings access). `Kitchen` has `kitchen.view` only (KDS: list/advance KOTs, print tickets).

## Realtime

Socket.io server initialized in `src/server.js` / `src/sockets/index.js`.

**Auth:** clients must connect with `auth: { token }` (the same JWT used for the REST `Authorization: Bearer` header) — `io.use()` verifies it and disconnects the socket on a missing/invalid token before `connection` fires.

**Rooms:** every authenticated socket joins `floor`; sockets belonging to a user with `kitchen.view` (or `Admin`) additionally join `kitchen`. `emitTo(room, event, payload)` (exported from `src/sockets/index.js`) is the room-scoped emit helper used by the new dine-in modules. The pre-existing global `emit()` helper in `payments.service.js` (broadcasts to every connected socket via `getIO().emit(...)`) is unchanged and still used by the payments module.

Events:
- `order.created` / `order.updated` / `order.closed` — floor.
- `table.updated` — floor.
- `kot.created` / `kot.updated` / `kot.ready` — kitchen **and** floor.
- `invoice.created` `{invoiceId, invoiceNumber, orderId, total}` — floor. Emitted per invoice from `POST /api/orders/:id/bill`.
- `payment.completed` `{invoiceId, orderId}` — floor. Emitted by `settleInvoicePaid` once a dine-in order's invoices are all `PAID` and the order closes.
- `invoice.paid` `{invoiceId, invoiceNumber, total, paymentMethod}` — unchanged legacy event, still emitted (globally) whenever any payment (manual or card, Mode 1 or Mode 2) succeeds.
- `payment.updated` `{paymentId, invoiceId, status, invoiceNumber}` — unchanged legacy event, still emitted (globally) on every card-payment status transition.

---

## Phase 5.1: ERP core

Multi-tenancy scaffolding, an in-process event bus, an audit trail, and inventory/recipes/purchasing — the first slice of the ERP roadmap. Everything here is additive: Mode 1 and Mode 2 endpoints/behavior above are unchanged.

### Multi-tenant / branch scaffolding

`src/common/database/tenantPlugin.js` is a **global** Mongoose plugin (`mongoose.plugin(fn)`) that adds `tenantId` (default `'default'`, indexed) and `branchId` (default `'main'`, indexed) to **every** schema compiled after it's required — including nested subdocument schemas (order items, invoice items, PO lines, menu item modifiers/recipe lines, etc.), since Mongoose applies global plugins inside the `Schema` constructor itself. This is why it must be the very first `require` in any entrypoint that loads models:
- `src/app.js` — first line, before any `*.routes.js` require (which transitively pull in controller → service → model chains).
- `src/common/database/seed.js` and `src/common/database/migrateTenant.js` — first line.

`src/common/middleware/tenantContext.js` sets `req.tenantId`/`req.branchId` (`'default'`/`'main'` unless `req.user.tenantId` or the `x-branch-id` header say otherwise). It's mounted globally in `app.js` right after body parsing (covers every request, including unauthenticated ones), and is **also** re-applied inside the branches/inventory/vendors/purchase-orders routers immediately after their own `router.use(requireAuth)` — because `requireAuth` itself is mounted per-router rather than globally, so `req.user` isn't populated yet when the global copy runs. The middleware is idempotent, so running it twice is harmless.

**Branches** — `src/modules/branches/`: `Branch {code (unique), name, address, phone, active}`.
- `GET /api/branches`, `GET /api/branches/:id` — any authenticated user.
- `POST /api/branches`, `PUT /api/branches/:id`, `DELETE /api/branches/:id` (soft: `active=false`) — `branches.manage` (Admin only per the seed).

**Migration** — `npm run migrate:tenant` (`src/common/database/migrateTenant.js`): iterates every collection in the connected database and runs `updateMany({tenantId: {$exists: false}}, {$set: {tenantId: 'default', branchId: 'main'}})`. Idempotent — a second run matches/modifies 0 documents.

**Scoping caveat:** only the *new* Phase 5.1 modules (inventory, purchasing, branches) are written to be branch-aware in their queries. Existing modules (orders, invoices, menu, etc.) now carry `tenantId`/`branchId` fields via the plugin, but their read paths don't yet filter by them — actually scoping every existing query is deferred to a later slice.

### Event bus — `src/common/eventBus.js`

A thin wrapper over `node:events`:
- `publish(event, payload)` — logs `[event] <name>`, best-effort mirrors the same event to the `floor` socket room (wrapped in try/catch, safe when socket.io isn't initialized), and synchronously emits on the underlying `EventEmitter` for in-process subscribers.
- `subscribe(event, handler)` — registers an in-process listener.

Subscribers are registered once, from `src/subscribers/index.js`, required by `server.js` after the DB connects:
- `src/modules/audit/audit.subscriber.js` — logs `order.completed`.
- `src/modules/inventory/stockDeduction.subscriber.js` — the automatic recipe deduction (see Inventory below).

**Existing flows refactored to also publish** (their direct socket `emitTo` calls are kept as-is — `publish()` is additive, so these events currently reach the `floor` room twice: once via the original `emitTo` call, once via `eventBus.publish`'s own socket mirror):
- `order.completed {order}` — `orders.service.settleInvoicePaid`, right when an order reaches `CLOSED`.
- `payment.completed {invoiceId, orderId}` — same place, alongside the pre-existing socket-only emit.
- `invoice.paid {invoice}` — both the manual-payment controller and the card `applyStatus` `SUCCESS` branch, right after the invoice is marked `PAID` (in addition to the pre-existing, differently-shaped `invoice.paid` socket broadcast in `payments.service.js`/`payments.controller.js` — same event name, different payload shape: the legacy one is a flat summary object, the bus one wraps the full `invoice` doc).

**New events (Phase 5.1):**
- `inventory.updated {inventoryItemId, branchId, currentStock}` — published on every `applyStockChange` call.
- `stock.low {inventoryItemId, name, currentStock, minStock, branchId}` — published whenever a stock change leaves `currentStock < minStock`.

### Audit — `src/modules/audit/`

`AuditLog {userId, userName, action, entity, entityId, meta, at}` (+ `tenantId`/`branchId` via the plugin). `src/modules/audit/audit.service.js` exports `log({req?, user?, action, entity, entityId, meta})` — **fire-and-forget**: it wraps its own `AuditLog.create` in try/catch and never throws, so a failed audit write can never break the caller's main operation. Callers pass either `req` (pulls `user`/`tenantId`/`branchId` off it automatically) or an explicit `user`.

Wired into: `auth.controller.login` (`auth.login`), `settings.controller.updateSettings` (`settings.update`), `inventory.controller.adjust` (`stock.adjust`), `purchasing.controller` create/place/receive/cancel (`po.create`/`po.place`/`po.receive`/`po.cancel`), `payments.controller.manual` and `payments.service.applyStatus`'s `SUCCESS` branch (`payment.manual`/`payment.card`), and the `order.completed` event-bus subscriber (`order.completed`).

- `GET /api/audit?action=&entity=&from=&to=&page=&limit=` (`audit.view`) — newest first, `{items, total, page}`. In practice Admin-only, since only `Admin` has `audit.view` in the seed (and Admin always bypasses the permission check anyway).

### Inventory & recipes — `src/modules/inventory/`

`InventoryItem {name, sku, unit: 'g'|'kg'|'ml'|'l'|'pc', category, currentStock, minStock, avgCost, active}` — unique on `(tenantId, branchId, name)`. `StockTransaction {inventoryItemId, type: 'PURCHASE'|'CONSUMPTION'|'ADJUSTMENT'|'WASTAGE'|'RETURN', qty (signed), unitCost, refType: 'ORDER'|'INVOICE'|'PO'|'MANUAL', refId, note, balanceAfter, by: {id, name}}`.

`inventory.service.applyStockChange({itemId, type, qty, unitCost?, refType, refId, note?, user?})` is the one place every stock mutation goes through (manual adjust/wastage, PO receiving, automatic recipe deduction):
1. Reads the item's current `currentStock`/`avgCost`.
2. `findByIdAndUpdate` with `$inc: {currentStock: qty}` (and `$set: {avgCost}` for `PURCHASE` — see weighted-average formula below), reading the result back.
3. Creates the `StockTransaction` with `balanceAfter` from the read-back value.
4. Publishes `inventory.updated`, and `stock.low` if the new `currentStock < minStock`.

Not a true multi-document transaction (no new deps; the standalone Mongo deployment here has no replica set to run one on) — there's a small read-then-write race window under heavy concurrent writers on the *same* item, an accepted tradeoff for this phase.

**Weighted average cost** (on `PURCHASE` transactions with a `unitCost`): `avgCost' = (max(oldStock, 0) × oldAvgCost + qty × unitCost) / (max(oldStock, 0) + qty)`. Verified: item starts at 0/₹0; receive 4kg @ ₹22 → avgCost ₹22; receive 6 more @ ₹20 → `(4×22 + 6×20)/10 = 20.8`.

Endpoints (`inventory.manage` for writes; reads also allow `purchasing.manage`):
- `GET /api/inventory?search=&low=true&page=&limit=` → `{items, total, page}`
- `GET /api/inventory/low` — items where `currentStock < minStock`, active only
- `GET /api/inventory/:id`, `GET /api/inventory/:id/ledger?page=&limit=` (newest first)
- `POST /api/inventory`, `PUT /api/inventory/:id`, `DELETE /api/inventory/:id` (soft: `active=false`)
- `POST /api/inventory/:id/adjust {qty (signed), type: 'ADJUSTMENT'|'WASTAGE', note?}` → `applyStockChange` (`refType: 'MANUAL'`) + audit log

**Recipes** are embedded directly on `MenuItem` (`recipe: [{inventoryItemId, qty, unit}]`, `qty` = amount of that inventory item consumed per 1 sold unit) — a deliberate deviation from separate `Recipe`/`RecipeIngredient` collections, for the same reason order items are embedded on `Order`: a recipe is only ever read/written alongside its menu item, so a join buys nothing. `POST`/`PUT /api/menu` validate every `recipe[].inventoryItemId` actually exists before saving (`400` otherwise).

**Automatic deduction** (`src/modules/inventory/stockDeduction.subscriber.js`):
- On `order.completed` (dine-in, Mode 2): for each order item whose menu item has a non-empty `recipe`, a `CONSUMPTION` transaction of `-(recipe.qty × item.qty)` per recipe line, `refType: 'ORDER'`.
- On `invoice.paid`, **only when `invoice.orderId` is unset** (counter sale, Mode 1): same deduction logic against the invoice's items, `refType: 'INVOICE'`. Dine-in invoices (`orderId` set) are skipped here — they're deducted via `order.completed` instead, so a dine-in sale is never double-deducted by construction, not just by the idempotency flag below.
- **Idempotency:** both `Order` and `Invoice` carry a plain `stockDeducted` boolean (default `false`). The subscriber atomically claims the right to deduct via `findOneAndUpdate({_id, stockDeducted: {$ne: true}}, {$set: {stockDeducted: true}})` *before* looping over items — a duplicate `order.completed`/`invoice.paid` publish (e.g. a retried webhook) finds no matching document the second time and no-ops. Equal-split synthetic invoices (`orders/split.js` `splitEqually`) have no `menuItemId` on their synthetic line, so they naturally produce zero deduction lines.
- Deduction failures are caught and logged (`console.error`) per recipe line/item — they never propagate back to break the payment or order-close flow that triggered them.

### Purchasing — `src/modules/purchasing/`

`Vendor {name, phone, email, gstin, address, active}` — CRUD at `/api/vendors` (`purchasing.manage` for writes; reads also allow `inventory.manage`).

`PurchaseOrder {poNumber ('PO-YYYYMMDD-XXX'), vendorId, vendorName, status, items: [{inventoryItemId, name, unit, qty, unitCost, receivedQty}], subtotal, expectedAt, note}`.

**PO FSM** (`src/modules/purchasing/po.machine.js`, tested in `po.machine.test.js`):
```
DRAFT ──► PLACED ──┬──► PARTIALLY_RECEIVED ──┬──► RECEIVED
                    │        ▲───────────────┘
                    └──────────────────────────► RECEIVED
DRAFT, PLACED ──► CANCELLED
```
(`PARTIALLY_RECEIVED → PARTIALLY_RECEIVED` is allowed — receiving more of a partially-received PO stays in that state until every line is fully received.)

Endpoints (`purchasing.manage`):
- `GET /api/purchase-orders?status=&page=&limit=`, `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders {vendorId, items: [{inventoryItemId, qty, unitCost}], expectedAt?, note?}` — creates `DRAFT`, validates every `inventoryItemId` exists, computes `subtotal`.
- `PUT /api/purchase-orders/:id` — `DRAFT` only (vendor/items/note).
- `POST /api/purchase-orders/:id/place` — `DRAFT → PLACED`.
- `POST /api/purchase-orders/:id/cancel` — `DRAFT`/`PLACED → CANCELLED` only (never once any line has been received).
- `POST /api/purchase-orders/:id/receive {items: [{itemId (the PO line's own _id), qty, unitCost?}]}` — validates each line exists and `receivedQty + qty ≤ ordered qty` (`400` otherwise, naming the shortfall), creates a `PURCHASE` stock transaction per line via `applyStockChange` (`unitCost` defaults to the line's own `unitCost`, driving the weighted-`avgCost` update), then sets status to `RECEIVED` if every line is now fully received, else `PARTIALLY_RECEIVED`. Every receive call is audit-logged (`po.receive`).

## Phase 5.2 — CRM favorites, loyalty, reservations, shifts, approvals

### CRM favorites — `src/modules/customers/`

`GET /api/customers/:id` now returns `{customer, stats, topItems}` — `topItems` is the top 5 items (by qty) across the customer's `PAID` invoices: `Invoice.aggregate([{$match:{customerId, paymentStatus:'PAID'}}, {$unwind:'$items'}, {$group: sum qty/amount by item name}, {$sort:{qty:-1}}, {$limit:5}])`. `Customer` also gained `referredBy` (validated on create/update — must exist, must not be self) for the loyalty referral flow below.

### Loyalty — `src/modules/loyalty/`

`Customer.loyalty {points (spendable), lifetimePoints (never decreases except manual ADJUST), tier}`, `referralRewarded`. `LoyaltyTransaction {customerId, type: 'EARN'|'REDEEM'|'ADJUST'|'REFERRAL', points (signed), refType: 'INVOICE'|'MANUAL', refId, note, balanceAfter}`. Settings gained `loyalty {pointsPer100, pointValue (₹ redeemed per point), referralBonus, tiers: [{name, minPoints}]}`, deep-merged the same way as `discounts`/`printing`.

**Earning** (`src/modules/loyalty/loyalty.subscriber.js`, on `invoice.paid`): gated by `settings.features.loyalty`; no-ops if the invoice has no `customerId`. Idempotency: `Invoice.loyaltyProcessed` is atomically claimed via `findOneAndUpdate({_id, loyaltyProcessed:{$ne:true}}, {$set:{loyaltyProcessed:true}})` — identical pattern to inventory's `stockDeducted`, so a duplicate `invoice.paid` publish is a no-op. Points = `floor(invoice.total / 100 * pointsPer100)`; customer's `points`/`lifetimePoints` both increase, `tier` is recomputed as the highest configured tier whose `minPoints ≤ lifetimePoints`. Publishes `loyalty.earned` and audits `loyalty.earned`.

**Referral bonus**: on the same `invoice.paid` handler, if the paying customer has `referredBy` set and `referralRewarded` is still `false`, the referrer is credited `referralBonus` points (type `REFERRAL`), tier recomputed, and `referralRewarded` is flipped — so the bonus is awarded exactly once, on the referred customer's first paid invoice, no matter how many further invoices they pay. Audited as `loyalty.referral`.

**Redemption** — `POST /api/loyalty/redeem {invoiceId, points}` (`billing.create`): invoice must exist, be `PENDING`, have a `customerId`, and the customer must hold ≥ `points` (a positive integer). `discountAmount = round2(points * pointValue)`, must be `≤ invoice.total`. Applies `invoice.loyaltyPoints`/`loyaltyDiscount` and folds the discount straight into `invoice.total` (subtotal/tax/discount/discountType/discountValue are left untouched — this is a payment-time reduction, not a re-priced sale). Guards double-redemption via `invoice.loyaltyPoints` already being set (`400`). **Known gap**: if a redeemed-but-still-`PENDING` invoice is later `CANCELLED`, the spent points are not currently refunded to the customer — out of scope for this phase, flagged for a follow-up.

**Manual adjust** — `POST /api/loyalty/adjust {customerId, points (signed), note}` (`loyalty.manage`): creates an `ADJUST` transaction; `lifetimePoints` only increases for positive adjustments (a negative manual adjustment reduces the spendable balance without erasing tier progress).

**Reads**: `GET /api/loyalty/summary/:customerId` → `{points, lifetimePoints, tier, nextTier: {name, pointsNeeded}|null, pointValue}`; `GET /api/loyalty/transactions/:customerId?page&limit`. Both allow `billing.create` OR `loyalty.manage`.

### Reservations — `src/modules/reservations/`

`Reservation {reservationNumber ('RSV-YYYYMMDD-XXX'), customerId, customer:{name,phone} (snapshot), partySize, scheduledAt, tableId/tableName (preference at booking only), note, status, orderId}`.

**FSM** (`reservation.machine.js`, tested in `reservation.machine.test.js`): `BOOKED → SEATED → COMPLETED`; `BOOKED → CANCELLED`; `BOOKED → NO_SHOW`.

Endpoints (`reservations.manage` OR `orders.take`):
- `POST /api/reservations {customer:{name,phone}, partySize, scheduledAt, tableId?, note}` — upserts the `Customer` by phone (same `customersService.upsertByPhone` invoices use), allocates `reservationNumber` via a daily counter.
- `GET /api/reservations?date=YYYY-MM-DD&status=&page&limit` — `date` matches `scheduledAt` within the *local* calendar day (same `localDay` boundary logic as `reports.controller`, reimplemented here against `scheduledAt` rather than `createdAt`).
- `PUT /:id` — `BOOKED` only.
- `POST /:id/seat {tableId}` — table must be `FREE`; creates a `DINE_IN` order via `ordersService.createOrder` (reused as-is, waiter = the seating user), sets `reservation.orderId` and `status: SEATED`, returns `{reservation, order}`.
- `POST /:id/cancel`, `POST /:id/no-show`.

**Subscriber** (`reservations.subscriber.js`, on `order.completed`): if a `SEATED` reservation's `orderId` matches the completed order, transitions it to `COMPLETED` (FSM-validated) and audits `reservation.complete`. Every create/status-change publishes `reservation.updated` via the shared event bus, which forwards to the `floor` socket room the same way `table.updated`/`order.updated` do.

### Shifts & cash drawer — `src/modules/shifts/`

`Shift {shiftNumber ('SH-YYYYMMDD-XX'), status: 'OPEN'|'CLOSED', openedBy/openedAt, openingFloat, closedBy/closedAt, expectedCash, declaredCash, variance, movements:[{type:'IN'|'OUT', amount, reason, by, at}], note}`. At most one `OPEN` shift per branch — `POST /api/shifts/open` returns `409` if one already exists (checked via `Shift.findOne({status:'OPEN', branchId})`).

**Close math** (`POST /api/shifts/:id/close {declaredCash, note?}`): `expectedCash = openingFloat + Σ(CASH payments, status SUCCESS, createdAt in [openedAt, now]) + Σ(IN movements) − Σ(OUT movements)`; `variance = round2(declaredCash − expectedCash)`. `GET /api/shifts/:id` and `GET /api/shifts/current` expose the same breakdown live (computed against `now` instead of `closedAt` while still `OPEN`) as `cashSummary`/`{openingFloat, cashSales, movementsIn, movementsOut, expectedCash, declaredCash, variance}`.

Endpoints (`shifts.manage`): `POST /open`, `GET /current`, `POST /:id/movement {type, amount>0, reason}` (`OPEN` only), `POST /:id/close`, `GET /?page&limit` (history, newest first), `GET /:id` (detail + breakdown).

**Deviation**: the Employees domain named in the phase doc is deliberately *not* a new module — it's already covered by the existing `users`/`roles` modules (Phase 1), which already handle staff accounts, roles, and permissions. No duplicate module was added.

### Approvals (manager PIN override) — `src/modules/approvals/`

Settings gained `approvals {pinHash (bcrypt, never returned by GET), requireForDiscountAboveMax}` — `GET /api/settings` strips `pinHash` from the response entirely (replaced with a boolean `pinSet`). `PUT /api/settings/approvals/pin {pin}` (Admin-only, enforced via `authorize('Admin')` relying on `requireAuth`'s Admin-role bypass, since no non-admin role carries a literal `'Admin'` permission string) bcrypt-hashes and stores the PIN.

`POST /api/approvals/verify {pin}` (any authenticated user) compares against the stored bcrypt hash. On success, issues `{approvalToken}` — a JWT signed with the same `config.jwtSecret`, payload `{scope:'approval', by: req.user.id}`, `expiresIn: 120` (seconds). Audits `approval.granted` on success, `approval.denied` on a wrong PIN.

**Discount enforcement** (`billing.controller.js`/`billing.service.js`): where a discount exceeds `settings.discounts.maxPercent`, non-Admins are rejected (`400`) as before — now, before rejecting, the controller checks the `x-approval-token` header via `approvalsService.verifyApprovalToken` (JWT verify + `scope === 'approval'`); if valid, `validateDiscount` bypasses the max-percent check (the hard subtotal+tax ceiling still always applies) and the resulting invoice is audited as `approval.used`. Invalid/absent token falls through to the existing `400`.

**Deviation**: a full async approval queue (e.g. a manager approving from a different device/session while the cashier's screen waits) is out of scope for this phase — the PIN-token flow above is synchronous only, entered directly at the till.

### Flags, permissions

`settings.features` gained `reservations`, `shifts` (both default `false`, same UI-gate-only pattern as `loyalty`/`inventory`/etc — backend APIs stay live regardless). New permissions: `loyalty.manage`, `reservations.manage`, `shifts.manage`. Seed: Admin and Manager get all three (Manager via the existing "everything except the excluded list" pattern — these three were simply not added to `MANAGER_ONLY_EXCLUDED`); Cashier `+= shifts.manage`; Waiter `+= reservations.manage`.

## Phase 5.3 — QR/online ordering, delivery webhooks, analytics, branch hardening

Everything here is additive; Mode 1/2 and Phase 5.1/5.2 behavior above is unchanged. This phase also turns the previously-cosmetic `tenantId`/`branchId` fields (Phase 5.1) into REAL data isolation for a set of core collections — see "Branch-scoping hardening" below.

### QR / online ordering — `src/modules/public/`, `src/modules/tables/`

Gated end-to-end by `settings.features.onlineOrdering` (default `false`) — every `/api/public/*` route responds `403 {message:'Online ordering is disabled'}` while it's off, so a restaurant that hasn't rolled out QR ordering yet never exposes menu data. All `/api/public/*` routes are also rate-limited to **60 requests/min/IP** (`express-rate-limit`, standard headers) ahead of the flag check, since this surface is reachable by anyone who scans a QR code.

**Table QR tokens**: `Table.qrToken` (`String, unique, sparse`) is generated via `POST /api/tables/:id/qr-token` (`tables.manage`; `crypto.randomBytes(16).toString('hex')`) and printed onto a physical sticker. Regenerating invalidates the old code.

Public endpoints (`src/modules/public/public.routes.js`, no auth):
- `GET /api/public/menu` → `[{_id, name, sortOrder, items: [{_id, name, price, taxRate, modifiers, categoryId}]}]` — active menu items only, grouped under their category. **No recipe/cost data is ever included.** A category is considered "active" for this endpoint when it has at least one active menu item (`Category` itself has no `active` field of its own — it's shared across every other module, so this endpoint infers it rather than adding one).
- `GET /api/public/table/:qrToken` → `{tableName, status}`, `404` for an unknown token.
- `POST /api/public/orders` `{qrToken, customer: {name, phone}, items: [{menuItemId, qty, modifiers?: [{name}], note?}]}` — `customer.phone` is required. Every price/modifier is resolved server-side via the SAME helper the staff POS uses (`ordersService.priceRequestedItems` — a refactor of the logic `POST /api/orders/:id/items` already had, extracted so it isn't duplicated). The customer is upserted by phone (`customersService.upsertByPhone`, same helper invoices use) and linked onto the order (`order.customer`/`order.customerId`, new fields).
  - Table `FREE` → creates a new `Order` (`channel: 'QR'`, `type: 'DINE_IN'`, `guestCount: 2`, `waiter: {name: 'QR Guest'}`), occupies the table. Audited as `public.order`.
  - Table `OCCUPIED` with an `OPEN` order → appends the items as **unfired** lines onto that order (exactly like a staff `POST /api/orders/:id/items` call) — the QR channel never fires its own KOTs; staff still fire from the floor/KDS as normal. Also audited as `public.order` (`meta.appended: true`).
  - Table `BILLED`, or `OCCUPIED` with no linked/`OPEN` order → `409 {message:'Table is billing — please ask staff'}`.
  - Response: `{orderId, orderNumber, statusToken}` — `statusToken` is `order.publicToken` (a `crypto.randomBytes(20).toString('hex')` value, new field on `Order`), the guest's only credential for polling status.
- `GET /api/public/orders/:id/status?token=` → validates `token` against `order.publicToken` (`401` on mismatch) → `{orderNumber, status, items: [{name, qty, kotStatus}], subtotal, tax, total}`. `kotStatus` is `'NEW'` for an unfired line, or the linked `Kot.status` otherwise.

**New `Order` fields**: `channel: 'POS'|'QR'|'ONLINE'|'DELIVERY'` (default `'POS'`), `source: {partner, externalId}` (delivery only, see below), `customer: {name, phone}` / `customerId` (guest snapshot, mirrors `Invoice.customer`), `publicToken` (QR/online status-polling credential).

### Delivery partner webhooks — `src/modules/delivery/`

Provider pattern mirroring the payments module (`PaymentProvider`/`PaymentProviderFactory`): `DeliveryProvider` base class (`verifyWebhook(req, config)`, `mapOrder(payload)`), `ZomatoProvider`/`SwiggyProvider` subclasses, `DeliveryProviderFactory.get('zomato'|'swiggy')`.

**Neither partner has a public integration spec** for this project, so both subclasses simply parameterize ONE generic, clearly-marked-placeholder implementation in `DeliveryProvider` (only the settings key they read — `zomato` vs `swiggy` — differs):
- **Assumed webhook payload** (`src/modules/delivery/DeliveryProvider.js`): `{externalId, event?: 'cancelled', customer: {name, phone}, items: [{sku?, name, qty, note?}]}`.
- **Assumed signature scheme**: header `x-webhook-signature` = `HMAC-SHA256(rawBody, settings.delivery.<partner>.secret)`, timing-safe compared. Uses the same `req.rawBody` capture (`app.js`'s `express.json({verify})`) that `WorldlineProvider` relies on.
- **Item matching** (`src/modules/delivery/mapping.js`, unit-tested in `mapping.test.js` via the pure `mapOrderItemsPure`): sku first (exact), then name (case-insensitive exact) against the full active menu (one bulk `MenuItem.find({active:true})`, not a query per line). Unmatched items are collected and rejected as `400 {message:'Could not match menu items: <list>'}` — never silently dropped. Matched lines always take their `price`/`taxRate` from the matched `MenuItem`, never from the partner payload.

`settings.delivery`: `{zomato: {enabled, secret}, swiggy: {enabled, secret}}` — `secret` is deliberately left **readable** via `GET /api/settings` (unlike `approvals.pinHash`): an Admin configuring the integration needs to see/copy it, and it isn't a login credential. Deep-merged via `PUT /api/settings` the same way `paymentProviders`/`printing` are.

`POST /api/delivery/webhook/:partner` — **no auth** (HMAC-verified instead):
1. Unknown `partner` → `400`. Partner not `enabled` → `403`. Bad/missing signature → `401`.
2. `{event: 'cancelled', externalId}` → looks up the `Order` by `(source.partner, source.externalId)`, `404` if not found, else reuses the standard `ordersService.cancelOrder` (FSM-validated — an already-`INVOICED`+ order is rejected `400` exactly like a staff cancel would be). Audited as `delivery.cancel`.
3. Otherwise → maps the payload via the provider, creates an `Order` (`channel: 'DELIVERY'`, `type: 'TAKEAWAY'`, `source: {partner, externalId}`, `waiter: {name: '<partner> webhook'}`, server-priced items). **Idempotent** on `(source.partner, source.externalId)` (unique sparse index on `Order`): a lookup-before-create handles the common case, and a duplicate-key catch on the create itself handles the race where two deliveries of the same webhook land near-simultaneously — either way, a repeat webhook returns the SAME order with `200` (vs `201` for a genuinely new one) rather than creating a duplicate. Audited as `delivery.order`.

From here a delivery order behaves like any other `TAKEAWAY` order — staff fire its KOT and bill/pay it through the normal `/api/orders/:id/kot` → `/api/orders/:id/bill` → `/api/payments/*` flow.

### Analytics — `src/modules/analytics/`

`analytics.view` permission (seed: Admin, Manager). All endpoints accept `?from=&to=` (both default to today, same `localDay` local-timezone day-boundary convention as `reports.controller`) and consider **`paymentStatus: 'PAID'` invoices only, `status: 'CANCELLED'` excluded** — except `inventory-value`, which isn't invoice-based.

- `GET /api/analytics/overview` → `{revenue, invoiceCount, avgTicket, foodCost, grossProfit, foodCostPct}`.
- `GET /api/analytics/peak-hours` → `[{hour, revenue, count}]`, bucketed by the LOCAL hour (`new Date(invoice.createdAt).getHours()`) of each invoice, only hours with ≥1 invoice, ascending.
- `GET /api/analytics/items` → `[{name, qty, revenue, foodCost, margin, marginPct}]` per menu item sold, sorted by `revenue` desc — recipe profitability.
- `GET /api/analytics/channels` → `[{channel, revenue, count}]` — invoices grouped by their **order's** `channel` (`'POS'` for invoices with no `orderId`, i.e. Mode 1 counter sales); implemented as one invoice query + one batch `Order.find({_id:{$in:...}}).select('channel')` joined in JS, rather than a `$lookup` aggregation (simpler at this data volume, same result).
- `GET /api/analytics/inventory-value` → `{items: [{name, currentStock, avgCost, value}], totalValue}` — active inventory items, `value = currentStock × avgCost`.
- `GET /api/analytics/branches` → `[{branchId, revenue, count}]` — PAID invoices across **every** branch, grouped by `branchId`. Deliberately bypasses the branch-scoping hooks below (`.setOptions({skipBranchScope: true})`) since this endpoint's entire purpose is comparing branches against each other — it would be useless if silently narrowed to the caller's own branch.

**foodCost math** (`src/modules/analytics/analytics.service.js`, `foodCostForLine` — pure, unit-tested in `analytics.service.test.js`): for each invoice line with a `menuItemId` whose `MenuItem` has a non-empty `recipe`, `foodCost += Σ(recipeLine.qty × inventoryItem.avgCost) × item.qty`; a line with no `menuItemId`, no matching `MenuItem`, or an empty `recipe` contributes `0`. Every distinct `MenuItem` (with its `recipe`) and every distinct `InventoryItem` referenced by those recipes is batch-loaded ONCE per request (`loadMenuAndInventoryMaps`), not per invoice line. **Note**: this is a *retrospective* costing lens — it applies the menu item's **current** recipe/`avgCost` to historical invoice lines, not whatever recipe existed at the time each sale happened (unlike the real-time stock-deduction subscriber, which only ever deducts using the recipe live at deduction time). This is intentional for a profitability report (“what would this period have cost at today's ingredient prices/recipe”) but is a documented deviation from event-sourcing-style historical accuracy.

### Multi-tenant hardening — branch-data isolation

Phase 5.1 added `tenantId`/`branchId` fields to every schema but didn't enforce them in queries. Phase 5.3 makes branch scoping **real** for a specific set of collections, while leaving tenant-level/global collections untouched.

**Request context** (`src/common/requestContext.js`): a `node:async_hooks` `AsyncLocalStorage` carrying `{tenantId, branchId}` through the entire async call chain of a request — including event-bus subscribers invoked synchronously from within a request handler (`eventBus.publish` → `EventEmitter.emit` → an `async` subscriber's `await`s all execute inside the same continuation, so the context is still visible there). `tenantContext` middleware (`src/common/middleware/tenantContext.js`) wraps the rest of the request in `requestContext.run({tenantId, branchId}, () => next())`.

**Branch resolution**: the `x-branch-id` header is honored only when it names an **ACTIVE** branch (case-insensitive against `Branch.code`) — otherwise it's ignored and `'main'` applies. Active branch codes are cached in-process for **~30s** (`tenantContext.js`'s `getActiveBranchCodes`) to avoid a DB round-trip on every request.

**Scoping mechanism** (`src/common/database/tenantPlugin.js`): a schema opts in via `new mongoose.Schema({...}, {branchScoped: true})`. When set:
- Every `find`/`findOne`/`findOneAndUpdate`/`findOneAndDelete`/`update*`/`deleteOne`/`deleteMany`/`countDocuments` query gets `branchId: ctx.branchId` injected into its filter — **unless** the filter already specifies a `branchId` (explicit always wins) or the query passed `.setOptions({skipBranchScope: true})` (the sanctioned escape hatch, used by `analytics.byBranch`).
- Every `aggregate()` pipeline gets a `{$match: {branchId: ctx.branchId}}` prepended — same explicit-filter and `skipBranchScope` escapes (checked via the aggregate's own `.option()`).
- Every **new** document gets `branchId` stamped from the context on `pre('save')` — so a `POST` made with `x-branch-id: b2` actually persists under branch `b2` instead of silently defaulting to `'main'`.
- **Outside a request context** (scripts, `npm run seed`, `npm run migrate:tenant`, a background timer not spawned from within `als.run`) none of this applies — `requestContext.get()` returns `undefined`, and the hooks treat that as "no scoping," never as "scope to nothing." This is why the legacy/no-header flow is unaffected: the default context is `{branchId: 'main'}`, which matches every pre-Phase-5.3 document (they all default to `branchId: 'main'` via the Phase 5.1 plugin).

**Branch-scoped collections** (`branchScoped: true`): `tables`, `orders`, `kots`, `invoices`, `payments`, `shifts`, `reservations`, `inventoryItems`, `stockTransactions`, `purchaseOrders`.

**NOT branch-scoped** (tenant-level/global, unchanged): `users`, `roles`, `settings`, `customers`, `menu` (categories/menu items), `vendors`, `branches`, `audit`. Rationale: staff, permissions, restaurant-wide settings, the shared customer/menu catalog, and the audit trail are conceptually restaurant-wide, not per-branch, in this app's model.

**Per-branch counters**: `src/common/utils/branchCounter.js` reads the current `branchId` from the request context. `'main'` (the pre-existing, single-branch reality) keeps its counter `Counter.key` (e.g. `order-20260711`) and visible number format (`ORD-20260711-0001`) **byte-for-byte backward compatible**. Any other branch gets both its `Counter.key` suffixed (`order-20260711-b2`) AND its visible number prefixed (`ORD-B2-20260711-0001`) — otherwise two branches would each mint `ORD-20260711-0001` on the same day and collide on the `unique: true` `orderNumber` index. Applied to `nextOrderNumber`/`nextInvoiceNumber`/`nextKotNumber`/`nextPoNumber`/`nextShiftNumber`/`nextReservationNumber`.

**Verified**: creating a branch via `POST /api/branches`, then a table/invoice with `x-branch-id: <code>` — the new docs carry that `branchId`, are visible with the header and invisible without it, and their invoice-number sequence starts independently at `0001` (prefixed) while the `'main'` sequence continues unaffected. Legacy flows (`GET /api/invoice`, `GET /api/orders`, `GET /api/tables` with no header) are unaffected — they simply keep seeing `branchId: 'main'` data, exactly as before this phase.

### Flags, permissions (5.3)

`settings.features.onlineOrdering` (default `false`) — gates `/api/public/*` (see above). New permission `analytics.view` — seed: Admin and Manager (via the same "everything except the excluded list" pattern; not added to `MANAGER_ONLY_EXCLUDED`).

## Phase 6.1: True multi-tenancy

Every restaurant (tenant) now has fully isolated data, its own signup, and its own socket rooms. A tenant's **slug doubles as its `tenantId`** value on documents (human-readable; the pre-existing production data is tenant `default`).

### Tenant registry & signup

- `src/modules/tenants/tenant.model.js` — `Tenant {name, slug (unique), ownerEmail, status: ACTIVE|SUSPENDED}`. The ONE model that is **not** tenant-scoped (`{tenantScoped: false}` schema option — no `tenantId`/`branchId` fields, no scoping hooks).
- `POST /api/auth/register` (public, rate-limited 10/hr/IP) `{restaurantName, ownerName, email, password (≥8)}` → creates the Tenant (slug generated from the name, random 4-hex suffix on collision — `src/modules/tenants/slug.js`), provisions its baseline docs, and responds exactly like login (`{token, user}`) so the client auto-logs-in. Email is unique **globally** across all tenants (409 `An account with this email already exists`). Audited as `tenant.registered`.
- **Provisioning** — `src/common/database/provisionTenant.js` `provisionTenant({tenantId, restaurantName, owner})`: creates, for that tenant, the 5 roles + permission sets, the settings doc, the `main` branch and the owner user as Admin. Upsert-safe; `npm run seed` now just ensures the `default` Tenant record and calls this for `'default'` (plus the demo menu) — a no-op on live data.
- **Suspension**: set `Tenant.status = 'SUSPENDED'` → login, public QR ordering and delivery webhooks all respond `403 This restaurant account is suspended`. Phase 6.2 extends this to **every authenticated request and live socket** (see below).

### Tenant scoping (the isolation mechanism)

`tenantPlugin.js`'s model-compilation hook now applies **tenant scoping to every model** (the exact same mechanics as the opt-in `branchScoped` hooks): every find-family query/`countDocuments` gets `tenantId: ctx.tenantId` injected (unless the filter already names one), every `aggregate()` gets a `$match` prepended, and new docs are stamped on save (an explicitly-set `tenantId` wins over the ambient context). The escape hatch is `.setOptions({skipTenantScope: true})` — used only where a lookup is legitimately cross-tenant:
- auth login/register user-by-email (email is global),
- public QR-token → table resolution and public order-status → order resolution,
- payment vendor callbacks resolving a payment by reference.

**Context plumbing**: the JWT now carries `tenantId`. `requireAuth` re-enters `requestContext.run` with the token's tenant (and re-resolves `x-branch-id` within that tenant — branch-code cache is per-tenant now), so every authenticated request is scoped no matter which router it hits. Unauthenticated surfaces resolve their tenant explicitly:
- **QR/public** (`/api/public/*`): the table's `qrToken` (globally unique) resolves the tenant; the rest of the request runs in that tenant's context. `GET /api/public/menu` now **requires** `?token=<qrToken>`. Gated per tenant on `settings.features.onlineOrdering` and tenant status.
- **Delivery webhooks**: canonical path is now `POST /api/delivery/webhook/:tenantSlug/:partner` (per-tenant settings/secrets); the old `/webhook/:partner` path still works as an alias for `default`.
- **Payment callbacks & the poller**: resolve the payment first, then run processing inside `requestContext.run({tenantId, branchId})` of that payment — same for `poller.js` intervals (which have no ambient request context).

**Sockets**: rooms are `floor:<tenantId>` / `kitchen:<tenantId>`; clients join their JWT's tenant rooms, and `emitTo('floor'|'kitchen', ...)` appends the caller's tenant from the request context automatically — no emit call site changed.

**Counters**: `branchCounter.js` bakes the tenant into counter keys/number prefixes the same way as branches: tenant `default` is byte-for-byte backward compatible (`INV-20260711-0001`); any other tenant gets `invoice-20260711-<slug>` keys and `INV-<SLUG>-20260711-0001` numbers, so the still-global unique number indexes can't collide across tenants.

### Index migration

```bash
npm run migrate:tenant-indexes   # idempotent — checks listIndexes first
```
Converts single-tenant uniques to per-tenant compounds (also declared on the schemas so fresh installs match): `roles (tenantId,name)`, `customers (tenantId,phone)`, `tables (tenantId,branchId,name)`, `branches (tenantId,code)`, `categories (tenantId,name)`, `settings (tenantId)` unique (one settings doc per tenant). `users.email` stays **globally** unique; `inventoryitems` already had its compound; `menuitems` has no unique name/sku index.

### Verification tooling

```bash
npm run sweep:isolation            # scripts/tenantIsolationSweep.js
npm run delete:tenant -- <slug>    # scripts/deleteTenant.js (refuses 'default')
```
- The **isolation sweep** logs in as both the default admin and a second tenant's owner (registering `TEST Bistro` via `/api/auth/register` if needed), hits every authenticated GET list endpoint with both tokens and asserts zero shared document `_id`s (plus: distinct settings docs, exactly the 5 provisioned roles / 1 branch / 1 user for the fresh tenant). Prints PASS/FAIL per route and exits non-zero on any leak.
- **deleteTenant** hard-deletes a tenant and every document carrying its `tenantId` across all collections (plus its tenant-suffixed counters and the Tenant record itself).

## Phase 6.2: Platform admin, suspension hardening, abuse guards

### Platform admin (cross-tenant super-admin) — RETIRED, see Phase 6.4a

> This subsection describes the ORIGINAL Phase 6.2 design. It has been fully replaced — kept here only for historical context. Skip to [Phase 6.4a](#phase-64a-platform-operator-identity-platform-settings-gmv-dashboard) for the current mechanism.

- ~~`User.platformAdmin` (Boolean, default `false`) — a cross-tenant super-admin flag baked into a TENANT user's account (`admin@pos.local`).~~ **Removed.** A leaked/compromised restaurant admin account could carry this flag, which is exactly the flaw Phase 6.4a fixes: the platform operator is now a completely separate identity that doesn't belong to any tenant.
- ~~`src/common/middleware/requirePlatformAdmin.js`~~ — **deleted**; replaced by `requirePlatformAuth.js`.
- **`/api/platform/*`** (`src/modules/platform/`) still exists and still operates **across tenants** (every query passes `skipTenantScope` explicitly), but is now gated by `requirePlatformAuth` instead of `requireAuth + requirePlatformAdmin` — see Phase 6.4a for the current request/response shapes (`revenue30d` has been renamed `gmv`/`gmvTrend`, and both `/overview` and `/tenants` now accept a `range`).
  - `PATCH /api/platform/tenants/:slug` `{status: 'ACTIVE'|'SUSPENDED'}` → updates `Tenant.status`. **Refuses to suspend `default`** (`400 The primary tenant cannot be suspended`). On change: invalidates the status cache and — if suspending — force-disconnects that tenant's live sockets. Audited `platform.tenant.suspended` / `platform.tenant.activated`. (Unchanged behavior from 6.2 — only the auth gate in front of it changed.)

### Suspension hardening — it bites everywhere, not just new logins

- `src/modules/tenants/tenantStatus.js` — in-memory status cache: `getStatus(tenantId)` → `'ACTIVE'|'SUSPENDED'` with a ~30s TTL (reads `Tenant` with `skipTenantScope`); `invalidate(tenantId)` clears one entry. Unknown tenants and DB errors **fail open** (ACTIVE) so a blip can't lock everyone out. TTL/invalidate behavior is unit-tested in `tenantStatus.test.js`.
- `requireAuth` — after resolving `req.user.tenantId`, checks `getStatus`; a `SUSPENDED` tenant gets `403 {code: 'TENANT_SUSPENDED', message: 'This restaurant account is suspended'}`. **Exemptions**: the `/api/platform/*` routes (moot as of 6.4a — that surface no longer runs through `requireAuth` at all) and `/api/auth/*` (login does its own check + 403; `/me` stays reachable). The `PATCH` `invalidate()` makes a suspension effective immediately (otherwise within the TTL window).
- **Sockets** — the handshake rejects a suspended tenant's connection; `disconnectTenant(tenantId)` tears down all of a tenant's live sockets and is called by the `PATCH` on suspend. (No more "platform admin" socket exemption — operators don't connect via the tenant socket at all.)
- **Public + delivery** surfaces retain their per-request tenant-status `403` from Phase 6.1.

### Public-surface abuse guards

- **QR public endpoints** (`/api/public/*`, ~60/min) are rate-limited keyed per **tenant+IP** rather than IP alone, so one busy restaurant can't exhaust another's window. The limiter runs before DB tenant resolution, so the key combines the request's QR/order identifier (`qrToken` / order id — which maps to a tenant) with the client IP (via `ipKeyGenerator` for IPv6 safety).
- **Registration** stays rate-limited at ~10/hr/IP.

### Tenant profile sync

- `PUT /api/settings` changing `restaurantName` also updates the matching `Tenant.name` (slug is immutable). Audited `tenant.renamed` when the name actually changes.

## Phase 6.3: Email delivery, password reset, email verification, account self-service, tenant data export

### Email provider architecture (`src/common/email/`)

Mirrors the payments module's provider/factory pattern exactly:

- `EmailProvider.js` — base class; `async send({to, subject, html, text})` throws `'Not implemented'`.
- `ResendProvider.js` — real implementation against `POST https://api.resend.com/emails` (`Authorization: Bearer <RESEND_API_KEY>`). Uses Node 22's global `fetch` — no extra dependency. Parses the response; on a non-2xx it logs the HTTP status + Resend's error message (**never the API key**) and throws.
- `SendgridProvider.js` / `PostmarkProvider.js` — stub classes (mirror `PineLabsProvider`/`WorldlineProvider` placeholders) so a future phase can wire up an alternate provider behind the same interface without touching any call site.
- `EmailProviderFactory.js` — `get(providerName)` → `RESEND | SENDGRID | POSTMARK` provider instance.
- `emailConfig.js` — **the single resolution point** for email config (`EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`). Every send() call site goes through `getEmailConfig()`, never `process.env` directly. **As of Phase 6.4a**, `getEmailConfig()` checks the `PlatformSettings` document first and falls back to these env vars exactly as before when no override is configured — see Phase 6.4a below.
- `templates.js` — `passwordResetEmail(link)` / `verificationEmail(link)`, each returning `{subject, html, text}` (inline-styled HTML, no build step, plain-text fallback).
- `emailService.js` — `sendPasswordResetEmail` / `sendVerificationEmail`. **Never throws** — a failed send is caught and logged; the calling flow (forgot-password, register, resend-verification, change-email) always succeeds from the user's perspective.

**To add a new provider** (e.g. finish `SendgridProvider`): implement `send()` against the vendor's API, register it in `EmailProviderFactory.js`'s `providers` map, set `EMAIL_PROVIDER=SENDGRID` — no other file changes.

### Password reset (mirrors the approvals module's scoped-JWT pattern)

- `POST /api/auth/forgot-password {email}` — public, rate-limited ~5/hr/IP. **Always** responds `200` with an identical generic body (`"If an account exists for that email, we've sent a reset link."`) whether or not the email exists — no enumeration side-channel, and deliberately **not** audit-logged (logging attempts would itself be a side-channel). If the user exists, signs a JWT `{sub, scope:'password-reset', iat}` (30 min expiry) and emails `${FRONTEND_URL}/reset-password?token=...`.
- `POST /api/auth/reset-password {token, newPassword}` — public. Verifies the JWT + `scope`, resolves the user globally (`skipTenantScope`, same as login), and rejects **already-used** tokens via `passwordChangedAt` vs the token's `iat` (see invalidation design below). Requires `newPassword` ≥ 8 chars. Bumps `passwordChangedAt`. Audited `auth.password_reset`.

**Token invalidation without a blacklist**: `User.passwordChangedAt` is bumped on every password change (reset **or** self-service `change-password`). `src/modules/auth/auth.tokenInvalidation.js` exports the pure comparison `isResetTokenInvalidated(passwordChangedAt, tokenIat)` — a reset token is rejected once the password has changed **after** it was issued. This means a `change-password` call also invalidates any outstanding, unused forgot-password token for that user — one shared field, no token store. Unit-tested in `auth.tokenInvalidation.test.js`.

### Email verification (not a login gate)

- `User.emailVerified` (Boolean, default `false`).
- `POST /api/auth/register` best-effort emails a verification link after creating the tenant+owner (`{sub, email, scope:'email-verify'}`, 24h expiry, `${FRONTEND_URL}/verify-email?token=...`) — registration succeeds even if the send fails.
- `POST /api/auth/verify-email {token}` — public. Verifies the JWT + scope, then checks `token.email === user's CURRENT email` (case-insensitive) via the pure `isVerifyTokenStale()` helper — rejects `400 'This link is no longer valid'` if the address changed since the link was sent (a stale link from before a `change-email` can't verify the wrong address). Sets `emailVerified = true`. Audited `auth.email_verified`.
- `POST /api/auth/resend-verification` — authenticated, ~3/hr/user. `400 'Already verified'` if already verified.
- Login/register/`me` payloads all include `emailVerified`.

### Self-service account changes (authenticated, own account only)

- `POST /api/auth/change-password {currentPassword, newPassword}` — bcrypt-verifies `currentPassword` against the full user doc, requires the new password ≥ 8 chars and different from the current one, bumps `passwordChangedAt` (invalidating outstanding reset tokens — see above). Audited `auth.password_changed`.
- `POST /api/auth/change-email {newEmail, currentPassword}` — verifies `currentPassword`, checks global email uniqueness (`skipTenantScope`, excluding self), sets `emailVerified = false` and best-effort emails a fresh verification link to the new address. Audited `auth.email_changed`.

### Tenant data export

- `GET /api/settings/export` — authenticated, `settings.manage`. Uses the **ambient** tenant context (plain `find({})` — the tenant-scoping hooks already confine every query to the caller's tenant); deliberately does **not** use `skipTenantScope`. Bundles `{exportedAt, tenant:{name,slug}, settings, categories, menuItems, customers, invoices (last 90 days), branches, tables}` as a downloadable `Content-Disposition: attachment` JSON file. Strips `settings.approvals.pinHash` and any delivery/payment-provider secrets before export. Audited `tenant.data_exported`.

### New env vars (`.env.example`)

```
EMAIL_PROVIDER=
RESEND_API_KEY=
EMAIL_FROM=
FRONTEND_URL=
```

## Phase 6.4a: Platform operator identity, platform settings, GMV dashboard

Fixes a real security flaw from Phase 6.2: the platform operator capability was a `platformAdmin: true` boolean bolted onto a TENANT-scoped user (`admin@pos.local`, who is also Arabian Cafe's restaurant admin). A leaked/compromised restaurant admin account could therefore carry platform-wide control. This phase **replaces** that mechanism entirely with a separate operator identity.

### PlatformOperator — a completely separate identity from tenant Users

- `src/modules/platform/platformOperator.model.js` — `{name, email (unique), passwordHash, active}`, `{tenantScoped: false}` (mirrors `Tenant`). No `tenantId`/`branchId`, no role, no relationship to any tenant whatsoever.
- `POST /api/platform/auth/login {email, password}` — public, rate-limited (~20/15min/IP). Looks up a `PlatformOperator` by email — **never touches the `User` collection at all**. Rejects inactive operators. Signs `{sub: operator._id, scope: 'platform-operator'}` (12h expiry) with the same `jwtSecret` as tenant tokens — the strict scope check below is what provides the isolation, not a second secret.
- `GET /api/platform/auth/me` — returns `{id, name, email}` for the authenticated operator.
- `src/common/middleware/requirePlatformAuth.js` — replaces the deleted `requirePlatformAdmin.js`. Verifies the JWT, **requires `scope === 'platform-operator'`** (a normal tenant user's token has no such claim and is flatly `401`'d — this is the crux of the fix), then looks the operator up by id and requires it still exists and is `active`. Does **not** touch `requestContext`/tenant scoping at all — the platform surface has no ambient tenant.
- `npm run create-operator` (`scripts/createOperator.js`) — bootstraps a real operator. Accepts `--email`/`--name` (or positional); the password is **always prompted interactively** (muted terminal echo on a real TTY) — never accepted as a CLI argument, since argv values land in shell history / `ps` output. `npm run delete-operator -- <email>` (`scripts/deleteOperator.js`) removes one.
- `src/common/database/migrateRemovePlatformAdmin.js` (`npm run migrate:remove-platform-admin`) — idempotent, cross-tenant cleanup that unsets the retired `platformAdmin` field from every existing user document.
- `admin@pos.local` / Arabian Cafe is now a plain, ordinary tenant — `npm run seed` no longer marks it `platformAdmin: true`.

### Platform settings singleton

- `src/modules/platform/platformSettings.model.js` — `{emailProvider: {provider, apiKey, fromAddress}, defaultTrialDays, supportEmail, maintenanceMode}`, `{tenantScoped: false}` singleton (mirrors `setting.model.js`'s per-tenant singleton pattern, except platform-wide).
- `GET /api/platform/settings` — **never returns the raw `apiKey`**; returns `{emailProvider: {provider, fromAddress, hasApiKey, apiKeyPreview}}` where `apiKeyPreview` is a masked `"••••1234"` (last 4 chars) or `null`.
- `PUT /api/platform/settings` — partial updates; upserts the singleton on first write. An empty/omitted `apiKey` means **"keep the existing key"**; a non-empty one replaces it. Refreshes `emailConfig.js`'s in-memory cache immediately so the change takes effect without a restart. Logs `[platform] settings updated by <operatorEmail>` — a proper platform-level audit trail (the existing `AuditLog` model is tenant/branch-scoped via the tenant plugin) is a good candidate for a future increment, deliberately out of scope here.
- **Email config override** (`src/common/email/emailConfig.js`): `getEmailConfig()` stays **synchronous** (every existing call site calls it without `await` — this was preserved rather than reworked). Internally it now reads from an in-memory cache of the `PlatformSettings.emailProvider` doc, refreshed asynchronously on module load and whenever `PUT /api/platform/settings` changes it. When the cached override has **both** `provider` and `apiKey` set, it wins; otherwise (including an incomplete override, e.g. provider picked but no key saved) the original env-var behavior (`EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`) resumes exactly as before — zero config changes required for the existing Resend setup to keep working. The resolution logic itself is extracted as a pure, unit-tested function (`resolveEmailConfig`, see `emailConfig.test.js`).
- **Maintenance mode**: `assertNotInMaintenance()` in `auth.service.js` blocks tenant `login`/`register` with a `503` when `PlatformSettings.maintenanceMode` is `true` (fails open on unexpected DB errors). Platform operators are entirely unaffected — they never call through tenant auth at all.

### GMV dashboard (honestly labeled — this is NOT platform revenue)

There is no subscription billing yet, so what's measured is **gross transaction volume** flowing through tenant restaurants (`gmv`), not money the platform operator earns. `revenue30d` has been renamed `gmv` throughout.

- `GET /api/platform/overview?range=today|7d|30d|all` (or `?from&to`) → `{tenantCount, active, suspended, signupsThisMonth, range, gmv, gmvTrend: [{date, gmv}]}`. Defaults to `30d` (matches the pre-6.4a default window).
- `GET /api/platform/tenants?range=...&sort=gmv|created` → `{items: [{slug, name, ownerEmail, status, createdAt, userCount, invoiceCount, gmv}], range, sort}`. Defaults to `sort=created` (unchanged ordering); `sort=gmv` turns it into a GMV leaderboard.

### Frontend

- `src/store/platformAuthStore.js` (zustand, localStorage key `platform-auth`) and `src/services/platformApi.js` (dedicated axios instance, `baseURL: /api/platform`) are **completely independent** of the tenant app's `authStore`/`api.js` — a browser can hold a tenant session and a platform session at the same time without either clobbering the other.
- `/platform/login` (public), `/platform` (Overview + tenants leaderboard + GMV trend chart), `/platform/settings` — all behind `PlatformProtectedRoute` (checks only `platformAuthStore`) → `PlatformLayout` (a minimal top-nav "Platform Console" shell, no tenant sidebar). The old `<ProtectedRoute requirePlatformAdmin>` wrapping inside the tenant app's route tree, and the "Platform" nav link (and all `user.platformAdmin` checks) in `AppLayout.jsx`, are removed — tenant users can never see or reach the platform surface again.

### Deviations from the spec

- The `PlatformLayout` nav shows **Overview** and **Settings** (not a separate "Tenants" link) — the tenants leaderboard lives on the Overview page alongside the stat cards/GMV chart, matching the pre-existing single-page design of `PlatformPage.jsx` rather than splitting it into a new page.
- Platform-level audit logging for settings changes is a `console.log` line, not a formal `AuditLog` entry (see rationale above) — flagged as a follow-up.
