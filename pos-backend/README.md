# POS MVP Backend

Restaurant POS backend supporting two modes. Express + MongoDB (Mongoose) + Socket.io.
- **Mode 1** — counter billing (`/api/invoice`, `/api/payments`), unchanged since the MVP.
- **Mode 2** — dine-in table service (`/api/tables`, `/api/orders`, `/api/kots`, `/api/print`), added in Phase 4. Gated for UI purposes by `settings.features.dineIn` (the APIs themselves are always available).
- **Phase 5.1 (ERP core)** — multi-tenant/branch scaffolding, an in-process event bus, an audit trail, and inventory/recipes/purchasing (`/api/branches`, `/api/audit`, `/api/inventory`, `/api/vendors`, `/api/purchase-orders`). See [Phase 5.1: ERP core](#phase-51-erp-core) below.

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
- `GET /api/tables` (`orders.take` or `tables.manage` or `billing.create`) — sorted by `zone, name`; each occupied table includes `order: {_id, orderNumber, guestCount, status, itemCount, total}`.
- `POST /api/tables` `{name, zone?, capacity?}` (`tables.manage`)
- `PUT /api/tables/:id` (`tables.manage`) — `400` unless the table is `FREE`
- `DELETE /api/tables/:id` (`tables.manage`) — `400` unless the table is `FREE`
- `POST /api/tables/:id/transfer` `{toTableId}` (`tables.manage` or `orders.take`) — moves the current order to the target table; `400` if source is `FREE` or target isn't `FREE`. Emits `table.updated` ×2 + `order.updated`.
- `POST /api/tables/:id/merge` `{fromTableId}` (`tables.manage` or `orders.take`) — appends `fromTableId`'s order items (fired and unfired) into `:id`'s order, recomputes totals, cancels the source order (`note: 'Merged into <destOrderNumber>'`), frees the source table. `400` unless both tables are `OCCUPIED` with `OPEN` orders. Any already-fired KOTs for the moved items are re-pointed (`orderId`/`orderNumber`/`tableId`/`tableName`) to the destination order/table, so a later cancel/KDS lookup on the destination order finds them. Emits `table.updated` ×2 + `order.updated` ×2.

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

`billing.create`, `billing.view`, `menu.manage`, `reports.view`, `users.manage`, `roles.manage`, `settings.manage`, `payments.take`, `customers.manage`, `tables.manage`, `orders.take`, `kitchen.view`, `inventory.manage`, `purchasing.manage`, `branches.manage`, `audit.view`.

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
