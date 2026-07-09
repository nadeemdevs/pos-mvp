# Restaurant POS — Mode 1 (Billing MVP)

Monorepo-style workspace built from `Restaurant_POS_Master_Plan.md`.

| Folder | Stack | Run |
|---|---|---|
| `pos-backend` | Express, Mongoose, JWT, Socket.IO | `npm run seed` then `npm run dev` (port 5001) |
| `pos-frontend` | React + Vite, TanStack Query, Zustand, Axios | `npm run dev` (port 5173, proxies `/api` → 5001) |

## Prerequisites
- Node.js 18+
- MongoDB running locally (`mongodb://127.0.0.1:27017/pos_mvp` by default — override via `pos-backend/.env`, see `.env.example`)

## Quick start
```bash
cd pos-backend && npm run seed && npm run dev
# in another terminal
cd pos-frontend && npm run dev
```

Login: `admin@pos.local` / `admin123`

## Scope (Phase 1)
Auth + roles/permissions, categories & menu management, billing POS screen
(search, category shortcuts, cart, discount, hold/resume bills), manual
payments (cash / UPI) via the payment-provider factory, daily/item/payment
reports, users, settings, browser-print receipts.

Card-terminal providers (Pine Labs, Worldline) are stubbed behind the same
`PaymentProvider` interface for Phase 2. Mode 2/3 modules (orders, tables,
kitchen, inventory) plug in as new modules without schema changes.
