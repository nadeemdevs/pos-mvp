# POS MVP Backend

Restaurant POS backend supporting two modes. Express + MongoDB (Mongoose) + Socket.io.
- **Mode 1** — counter billing (`/api/invoice`, `/api/payments`), unchanged since the MVP.
- **Mode 2** — dine-in table service (`/api/tables`, `/api/orders`, `/api/kots`, `/api/print`), added in Phase 4. Gated for UI purposes by `settings.features.dineIn` (the APIs themselves are always available).

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
- Roles: `Admin` (all permissions), `Manager` (all except `roles.manage`, including `customers.manage`), `Cashier` (`billing.create`, `billing.view`, `payments.take`, `orders.take`), `Waiter` (`orders.take`), `Kitchen` (`kitchen.view`)
- Admin user: `admin@pos.local` / `admin123`
- Categories: Beverages, Snacks, Meals, Desserts, each with a few sample menu items (INR, 5% tax)
- A default settings document

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
  - `features: { dineIn: false }` — gates the dine-in (Mode 2) **UI** only; `/api/tables`, `/api/orders`, `/api/kots`, `/api/print` stay available over the API regardless of this flag.

## Permission strings

`billing.create`, `billing.view`, `menu.manage`, `reports.view`, `users.manage`, `roles.manage`, `settings.manage`, `payments.take`, `customers.manage`, `tables.manage`, `orders.take`, `kitchen.view`.

`Admin` role bypasses permission checks entirely. `Manager` has all of the above except `roles.manage`. `Cashier` has `billing.create`, `billing.view`, `payments.take`, `orders.take` — which is also enough to list/read/create customers (see Customers above), since cashiers look up and create customers mid-sale. `Waiter` has `orders.take` only (take orders, fire KOTs, request bills — no billing/settings access). `Kitchen` has `kitchen.view` only (KDS: list/advance KOTs, print tickets).

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
