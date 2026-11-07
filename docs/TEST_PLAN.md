# Test Plan

## Unit
- Costing: estimated material/labor/overhead precision, moving-average receipt/issue/transfer valuation, unpriced stock incompleteness, missing standard cost marking, actual valued/unvalued inputs, accepted-unit cost, and outstanding WIP allocation.
- MRP engine: available stock netting, same-day/late confirmed supply, safety stock, minimum/lot sizing, lead-time release and late flags, nested MAKE/BUY propagation, available subassembly stock, and deterministic reruns.
- BOM explosion: one and multiple levels, shared components, nested multiplication, scrap, output quantity normalization, cycles, missing child BOM, and rounding.
- UOM conversion compatibility and precision.
- MRP: sufficient/insufficient stock, reservations, dated and late receipts, multilevel MAKE/BUY, safety stock, lot size, repeated deterministic runs.
- State transition policies for procurement, MO, and WO.
- QC quantity reconciliation including rework references.
- Decimal cost calculations and WIP allocation.

## Integration (isolated PostgreSQL required)
- BOM lifecycle integration is implemented in `tests/integration/bom-lifecycle.integration.test.ts`: draft creation, review/approval transitions, audit events, invalid transition, and database-triggered approved-line immutability. Run against a disposable database with `RUN_DB_INTEGRATION=true` and temporary `DATABASE_URL`/`DATABASE_URL_UNPOOLED`; the default suite skips it.
- Master data integration is implemented in `tests/integration/master-data.integration.test.ts`: item create/list/audit, duplicate SKU handling, UOM dimension validation, directed conversion persistence, and reverse-pair conflict. Both integration suites passed against a disposable PostgreSQL instance.
- Procurement integration is implemented in `tests/integration/procurement.integration.test.ts`: PR create/approval, PR-to-PO allocation, over-allocation rejection, PO approval, partial receipt posting to inventory, idempotent repost, fully-received status, and over-receipt rejection. Run against disposable PostgreSQL with `RUN_DB_INTEGRATION=true`; default suite skips it.
- MRP persistence integration is implemented in `tests/integration/planning.integration.test.ts`: released demand and dated approved PO supply produce a persisted run/input snapshot, dated buckets, recommendation, and source trace. Run against disposable PostgreSQL with `RUN_DB_INTEGRATION=true`; default suite skips it.
- Manufacturing integration is implemented in `tests/integration/manufacturing.integration.test.ts`: create MO from MAKE recommendation, snapshot effective approved BOM/material explosion, reserve from source warehouse on release, idempotently transfer issued stock into WIP with paired movements, consume WIP/return unused quantities, execute Work Orders, reconcile QC accepted/rejected/rework quantities, and post partial accepted production receipts only to finished goods. It tests over-receipt of accepted quantities and invalid transitions. Run against disposable PostgreSQL with `RUN_DB_INTEGRATION=true`; default suite skips it. Latest disposable-PostgreSQL run passed.
- Goods receipt partial/full/duplicate/over-receipt behavior.
- Inventory integration is implemented in `tests/integration/inventory.integration.test.ts`: idempotent receipt, availability reservation, prevented over-issue, atomic issue/release, paired warehouse transfer, adjustments, block/unblock, audit trace, and concurrent reservation race. Run against disposable PostgreSQL with `RUN_DB_INTEGRATION=true`; default suite skips it.
- Reservation and issue races; no negative stock under concurrent transactions.
- Transfer versus consumption distinction; ledger/balance atomicity.
- Posting idempotency, reversals, referential integrity, audit events.
- Permission checks and Better Auth session persistence.

## End-to-end
Seed synthetic furniture manufacturing data and exercise demand -> BOM/MRP -> purchase -> receipt -> MO -> issue -> work orders -> QC -> accepted receipt -> stock/cost/report traceability.

## Quality gates
Run typecheck, lint, unit tests, relevant integration tests, Playwright workflow when DB/browser infrastructure is available, and production build. Record command output and environment limitations. Never weaken assertions to pass.
