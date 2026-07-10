# Phase 5 - Mode 3: Restaurant ERP

## Objective
Convert the POS into a complete Restaurant ERP platform.

## New Domains
Inventory
Recipes
Stock
Purchasing
Vendors
Branches
CRM
Loyalty
Reservations
Delivery
Analytics
Audit
Approvals
Employees
Cash Drawer
Shifts

## Multi Tenant
Every collection must support tenantId and branchId.

## Inventory
Collections:
InventoryItem
Recipe
RecipeIngredient
StockTransaction
StockAdjustment

Order completion automatically deducts recipe ingredients.

## Purchasing
Vendor -> Purchase Order -> Goods Receipt -> Inventory.

## CRM
Customer history, visits, spending and favourites.

## Loyalty
Points, tiers, referrals and rewards.

## Reservations
Book, assign, arrive, complete and cancel reservations.

## Online Orders
Website, QR, Mobile App and Delivery partners all create the same Order entity.

## Analytics
Revenue, profit, food cost, inventory value, recipe profitability, branch comparison and peak hours.

## Event Bus
Publish events such as order.completed, inventory.updated, payment.completed and stock.low.

## Feature Flags
Enable modules per tenant: billing, orders, inventory, crm, loyalty and analytics.

## Acceptance
Fully multi-tenant, multi-branch, modular, event-driven and backward compatible.