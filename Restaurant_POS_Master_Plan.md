# Restaurant POS SaaS -- Technical Implementation Plan

## Goal

Build a modular Restaurant POS supporting three operating modes using a
single codebase.

### Tech Stack

-   Frontend: React + Vite
-   Backend: Express.js
-   Database: MongoDB + Mongoose
-   Authentication: JWT
-   Realtime: Socket.IO
-   File Storage: Local initially (S3 later)
-   Printing: Browser print initially, ESC/POS later

------------------------------------------------------------------------

# Product Vision

## Mode 1 (MVP) -- Billing POS ✅

Target: - Restaurants using paper order slips - Cafes - Bakeries - Tea
shops

Workflow

Customer → Waiter writes on paper → Kitchen → Customer goes to cashier →
Cashier enters items → Bill → Payment → Receipt

This is the only mode implemented initially.

## Mode 2 (Future)

Digital waiter ordering Kitchen Display System Table Management Order
lifecycle Split bills Realtime updates

## Mode 3 (Future)

Multi-branch Inventory recipes Purchase management CRM Loyalty QR
ordering Delivery integrations Enterprise analytics

------------------------------------------------------------------------

# High Level Architecture

Frontend - React - React Router - TanStack Query - Zustand - Axios

Backend - Express - Mongoose - Socket.IO - JWT - Modular architecture

Modules: - Auth - Users - Roles - Menu - Billing - Payments -
Customers - Reports - Settings

Future Modules: - Orders - Tables - Kitchen - Inventory - Purchase -
Loyalty

------------------------------------------------------------------------

# Suggested Folder Structure

## Frontend

``` text
src/
  app/
  pages/
  components/
  layouts/
  hooks/
  services/
  store/
  utils/
  routes/
```

## Backend

``` text
src/
 modules/
   auth/
   users/
   menu/
   billing/
   payments/
   reports/
   settings/
 common/
   middleware/
   utils/
   database/
 sockets/
 config/
```

------------------------------------------------------------------------

# Core Data Models

## User

-   name
-   email
-   passwordHash
-   roleId
-   active

## Role

-   Admin
-   Cashier
-   Manager

Permissions stored as array.

## Category

-   name
-   sortOrder

## Menu Item

-   categoryId
-   name
-   sku
-   price
-   taxRate
-   active

## Invoice

-   invoiceNumber
-   items\[\]
-   subtotal
-   tax
-   discount
-   total
-   paymentStatus
-   paymentMethod
-   paymentTransactionId
-   customer(optional)
-   cashier
-   timestamps

## Customer

-   name
-   phone

## Payment

-   invoiceId
-   provider
-   amount
-   status
-   reference
-   rawResponse

------------------------------------------------------------------------

# MVP Screens

Login

Dashboard

Billing - Search products - Category shortcuts - Cart - Discount - Hold
Bill - Resume Bill - Payment

Menu Management

Categories

Reports - Daily Sales - Payment Summary - Item Sales

Users

Roles

Settings

------------------------------------------------------------------------

# Backend APIs

Auth POST /auth/login

Menu GET /menu POST /menu PUT /menu/:id DELETE /menu/:id

Billing POST /invoice GET /invoice/:id GET /invoice

Payments POST /payments/initiate POST /payments/callback POST
/payments/manual

Reports GET /reports/daily GET /reports/items

Users CRUD

Roles CRUD

------------------------------------------------------------------------

# Payment Architecture

Never couple billing with a specific payment vendor.

``` ts
interface PaymentProvider {
  initiatePayment(invoice): Promise<PaymentResult>;
  cancelPayment(transactionId): Promise<void>;
  getStatus(transactionId): Promise<PaymentResult>;
}
```

Implement adapters:

``` text
PaymentProvider
      │
 ├── ManualCashProvider
 ├── ManualUPIProvider
 ├── PineLabsProvider
 ├── WorldlineProvider
 ├── IngenicoProvider
 └── RazorpayPOSProvider
```

Factory:

``` ts
const provider = PaymentProviderFactory.get("PINELABS");
await provider.initiatePayment(invoice);
```

Billing never references vendor SDKs directly.

------------------------------------------------------------------------

# Payment Flow

1.  Invoice created
2.  User selects payment type
3.  Payment factory loads provider
4.  Provider starts transaction
5.  Callback/websocket updates status
6.  Invoice marked PAID
7.  Receipt printed

Support: - Cash - Manual UPI - Card Terminal - Split Payment (future)

------------------------------------------------------------------------

# Roles

Admin Manager Cashier

Future: Waiter Kitchen

------------------------------------------------------------------------

# Reports

Daily Sales Payment Method Summary Top Selling Items Discount Report
Cancelled Bills Tax Summary

------------------------------------------------------------------------

# Security

JWT BCrypt Role middleware Audit logs Input validation Helmet Rate
limiting

------------------------------------------------------------------------

# Printing

Phase 1 Browser print

Phase 2 ESC/POS printer support

Phase 3 Kitchen printers

------------------------------------------------------------------------

# Future Mode 2 Changes

Add collections: Orders Tables

New modules: Kitchen Table Realtime

Socket Events order.created order.updated order.ready

Frontend Waiter App Kitchen Display

No breaking changes to existing billing module.

------------------------------------------------------------------------

# Future Mode 3 Changes

Inventory Recipes Stock deduction Purchase Orders Vendors Multi Branch
Central Reporting CRM Loyalty QR Menu Online Orders

Implemented as additional modules.

------------------------------------------------------------------------

# Development Roadmap

## Phase 1

-   Authentication
-   Roles
-   Menu
-   Categories
-   Billing
-   Manual Payments
-   Reports
-   Receipt Printing

## Phase 2

-   Payment adapter framework
-   Pine Labs integration
-   Worldline integration
-   Card terminal callbacks

## Phase 3

-   Hold/Resume Bills
-   Customer management
-   Discount rules
-   Settings

## Phase 4

-   Mode 2 modules

## Phase 5

-   Mode 3 modules

------------------------------------------------------------------------

# Design Principles

-   Single codebase
-   Feature flags for modules
-   Provider pattern for payments
-   Modular Express architecture
-   Reusable React components
-   REST APIs
-   Repository/service/controller separation
-   Easy migration from Mode 1 to Mode 2 without database redesign

The MVP must be production-ready for billing-only restaurants while
keeping all schemas and module boundaries compatible with future waiter
ordering, kitchen display, inventory, and enterprise features.
