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
- `POST /api/payments/manual` (payments.take) `{invoiceId, method: 'CASH'|'UPI', amount, reference?}`
- `POST /api/payments/initiate` (payments.take) `{invoiceId, provider}` — card providers (`PINELABS`, `WORLDLINE`) return `501` (not implemented)
- `POST /api/payments/callback` — stub, updates payment by `reference`

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

Socket.io server initialized in `src/server.js`. Emits `invoice.paid` when a manual payment is recorded successfully.
