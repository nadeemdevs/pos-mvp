# Restaurant POS — Multi-tenant SaaS

A multi-tenant restaurant POS/ERP SaaS. Each restaurant signs up at `/signup`
to get its own fully isolated workspace (data, users, settings); logged-out
visitors land on the marketing landing page at `/`. Every tenant runs the same
codebase but decides how much of it to switch on via per-tenant feature flags
in **Settings**.

| Folder | Stack | Run |
|---|---|---|
| `pos-backend` | Express, Mongoose, JWT, Socket.IO | `npm run seed` then `npm run dev` (port 5001) |
| `pos-frontend` | React + Vite, TanStack Query, Zustand, Axios | `npm run dev` (port 5173, proxies `/api` → 5001) |

## Operating modes

All three modes share one codebase and are toggled per-tenant with feature
flags in Settings — a tenant can run just billing, or turn on everything.

- **Billing** — the core POS: menu/categories, search + category shortcuts,
  cart, discounts, hold/resume bills, cash/UPI payments, receipts, and
  daily/item/payment reports.
- **Dine-in** — table floor management, per-table orders, and a live kitchen
  display (KDS) driven over Socket.IO. Includes the public QR-ordering surface
  where guests scan a table code and order without logging in.
- **ERP** — inventory + purchasing, customer loyalty, reservations, staff
  shifts, and analytics dashboards on top of the operational data.

## Platform operator

The seeded admin (`admin@pos.local`) is also the **platform operator**
(`platformAdmin`). They get a `/platform` console for tenant operations: an
overview of tenant counts / signups / revenue, and the ability to suspend or
reactivate individual tenants. Suspending a tenant logs its staff out and
blocks its requests until it's reactivated.

## Prerequisites
- Node.js 18+
- MongoDB running locally (`mongodb://127.0.0.1:27017/pos_mvp` by default —
  override via `pos-backend/.env`, see `.env.example`)

## Quick start
```bash
cd pos-backend && npm run seed && npm run dev
# in another terminal
cd pos-frontend && npm run dev
```

Open http://localhost:5173. Sign in with `admin@pos.local` / `admin123` (this
account is also the platform operator), or create a new restaurant at
`/signup`.

## Scripts & operations

Backend npm scripts (`pos-backend`):

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with nodemon (port 5001). |
| `npm run start` | Start the API without watch. |
| `npm run seed` | Seed the database (default tenant, roles/permissions, admin user). |
| `npm run test` | Run the backend test suite (`node --test`). |
| `npm run migrate:tenant` | Backfill/normalise per-tenant data for existing tenants. |
| `npm run migrate:tenant-indexes` | Ensure the per-tenant MongoDB indexes exist. |
| `npm run sweep:isolation` | Audit tenant isolation — flag any documents leaking across tenant boundaries. |
| `npm run delete:tenant -- <slug>` | Permanently delete a tenant and all its data by slug. |
