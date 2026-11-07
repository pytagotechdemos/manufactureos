# Workflows

## Production lifecycle
1. Engineering creates a draft BOM and routing; reviewers approve a revision.
2. Planner records dated demand and runs MRP against approved structures, current available inventory, dated confirmed supply, reservations, lead times, and safety stock.
3. Planner reviews shortages and recommendations; MRP output does not post procurement.
4. Purchasing converts approved recommendations/demands into purchase requests and orders.
5. Warehouse posts partial or full goods receipts. Each receipt atomically updates the ledger and balance; PO outstanding quantities remain traceable.
6. Planner creates an MO with BOM/routing snapshots and releases it after policy checks.
7. Warehouse reserves material, transfers it to WIP, and posts issues. Consumption is recorded separately from transfer.
8. Operators execute dependent work orders and record partial quantities, rejects, and labor time.
9. QC records inspection disposition. Rework remains linked to its original output; rejected output does not enter sellable stock.
10. Accepted partial production is posted to finished goods. Cost entries reconcile consumption, labor, overhead, and remaining WIP.
11. Reporting queries derive operational measures from persisted documents and transactions.

## Inventory receipt
Draft receipt -> validate PO outstanding amounts and source -> transactional idempotent post -> immutable movement -> on-hand/WAC update -> audit event -> receipt posted.

## Material issue
MO material requirement -> reserve only currently available amount -> transactional issue to WIP -> release reservation -> immutable movement -> audit event. Consumption is a later event.

## Authorization
Session -> permission identifier check -> Zod schema validation -> use case -> transactional persistence -> safe standardized response. UI visibility is not authorization.
