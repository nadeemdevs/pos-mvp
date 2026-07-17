---
name: verify
description: How to build, run, and drive this POS app to verify changes end-to-end.
---

# Verifying pos-mvp

## Stack / run
- `pos-backend/` — Express 5 + Mongoose + Socket.IO on **port 5001** (needs local mongod, `mongodb://127.0.0.1:27017/pos_mvp`). Start: `npm run dev` in pos-backend.
- `pos-frontend/` — Vite + React on **port 5173**. Start: `npm run dev` in pos-frontend. Hot-reloads, so if both servers are already up (check `lsof -iTCP:5001 -sTCP:LISTEN` / `:5173`) there is nothing to build.
- Production build check: `npx vite build` in pos-frontend (~1s). No eslint config exists — skip lint.

## Login / data
- Credentials: `admin@pos.local` / `admin123` (tenant "default"). Login page is `/login` with `input[type=email]`, `input[type=password]`, `button[type=submit]`.
- Seeded menu (~15 items) exists on the default branch ("Main Branch"); branch store defaults to `main`, so `/billing` works right after login.

## Driving the UI
- Use Playwright headless. No playwright in the repo — install in the scratchpad (`npm i playwright@latest`); browser binaries are already cached in `~/Library/Caches/ms-playwright` (install the playwright version matching the cached chromium revision, or run `npx playwright install chromium`).
- Useful selectors: `.menu-grid > *` (menu cards), `.cart-line` / `.cart-line-name` (cart), `.billing-tabs` / `.billing-tab` / `.billing-tab-dot` (order tabs), `.method-toggle` (payment modal), `.payment-success`.
- Cash payment flow: click "Charge" → wait `.method-toggle` → fill tendered input → click the primary confirm button → `.payment-success` → "New Sale".

## Gotchas
- Billing requires a specific branch; `activeBranch === 'all'` renders BranchRequiredNotice.
- Cart/tab state persists in `localStorage['pos-billing-tabs']` — clear it for a clean slate between runs.
