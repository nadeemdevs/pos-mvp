# Phase 4 - Mode 2: Full Restaurant POS

## Objective
Transform the existing Billing POS into a real-time Restaurant POS while preserving Mode 1 compatibility.

### New Modules
- tables
- orders
- order-items
- kitchen
- kitchen-order-ticket (KOT)
- waiter
- realtime (Socket.IO)
- printer abstraction

Each module should contain model, repository, service, controller, routes, validation, permissions and tests.

## Architecture
Order becomes the primary business entity.
Invoice is generated only after an order is completed.

Order lifecycle:
OPEN -> KOT_CREATED -> PREPARING -> READY -> SERVED -> REQUEST_BILL -> INVOICE_CREATED -> PAID -> TABLE_RELEASED

Implement the lifecycle as a finite state machine.

## Collections
RestaurantTable, Order, OrderItem, KitchenOrderTicket.

## Frontend
Cashier App, Waiter App and Kitchen Display System.

Cashier:
- Billing
- Payments
- Split Bills
- Table Transfer

Waiter:
- Table Grid
- Create Order
- Add Items
- Modifiers
- Notes
- Send KOT
- Request Bill

Kitchen:
- Incoming
- Preparing
- Ready

## Socket Events
order.created
order.updated
order.closed
table.updated
kot.created
kot.ready
invoice.created
payment.completed

## Features
Table management, merge tables, transfer tables, guest count, multiple KOTs, kitchen printer support, ESC/POS abstraction, immutable KOT history.

## Invoice
Expose InvoiceService.createFromOrder(orderId). Never duplicate billing logic.

## Acceptance
Existing Mode 1 tenants continue working unchanged.