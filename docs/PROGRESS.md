# Progress

## Current phase
Phase 6 — Quality, Costing & Reports (in progress)

## Completed

### Foundation
- Confirmed initial `C:\bom` workspace was empty; Node 24.11.1 and pnpm 10.12.4 available.
- Scaffolded Next.js App Router with TypeScript, Tailwind, ESLint, and `src` layout.
- Added Prisma 7, Neon adapter, local PostgreSQL adapter, Better Auth Prisma adapter, Zod, Vitest, Playwright, Prettier, dotenv, and lockfile.

### Authentication & Authorization (Phase 1)
- Closed email/password auth via Better Auth Prisma adapter; public signup disabled.
- Better Auth route handler at `/api/v1/auth/[...all]`.
- Login UI at `/login`; protected overview shell at `/overview`.
- Server-side active-user session check and permission lookup via `src/lib/auth-session.ts` and `src/lib/authorize.ts`.
- Role/permission seed implementation (8 roles, granular permissions).
- PostgreSQL trigger migration enforcing approved BOM immutability at the database level.

### Master Data & BOM (Phase 2)
- Item Master, UOM conversion, BOM lifecycle (Draft/In Review/Approved/Obsolete), audit entities in schema.
- Pure BOM explosion service using Decimal: output batch normalization, nested MAKE explosion, BUY leaf requirements, scrap, shared requirement aggregation, missing/ambiguous child BOM errors, cycle detection.
- Validated transactional BOM lifecycle service: draft create/edit, review submission, approval, obsolescence.
- Pure BOM explosion unit tests (8 cases).
- PostgreSQL trigger enforcing approved BOM immutability at the database level.

### Inventory Foundation (Phase 3)
- Stock ledger, balances, reservations, transfers, adjustments, immutable movement ledger.
- Stock availability = On Hand - Reserved - Blocked.
- Atomic posting with idempotency keys, concurrency-safe conditional updates, reversal/adjustment support.
- WIP transfer distinct from consumption.
- Stock balance, reservation, issue, transfer, adjustment APIs.

### Procurement & MRP (Phase 4)
- Production demand, purchase requests/lines, purchase orders/lines, goods receipts/lines.
- Deterministic time-phased MRP engine: dated supply, reservations, lead times, safety stock, lot sizing, BUY/MAKE logic, multi-level propagation.
- Partial goods receipts, over-receipt prevention, cancellation protection.

### Manufacturing Execution (Phase 5)
- MO with BOM/routing snapshots, Draft→Planned→Released→In Progress→QC Pending→Completed lifecycle.
- Work orders with start/pause/complete, actual time entries, material reservation/issue/consumption.
- Partial production output support.
- PostgreSQL integration verified against disposable database.

### Quality Control (Phase 6 - in progress)
- QC inspection record with accepted/rejected/rework reconciliation (inspected = accepted + rejected + rework).
- Post accepted production to finished goods stock; rejected goods blocked from sellable inventory.
- Rework tracked separately, not counted as new production output.
- QC inspection API with validation and audit events.

### Costing (Phase 6 - in progress)
- Estimated cost: BOM material quantity × standard cost + routing standard labor × work center rate + overhead.
- Actual cost: actual material consumption at valuation cost, recorded labor, overhead; WIP capitalized; accepted-unit cost excludes WIP cost.
- Moving weighted-average inventory valuation policy documented.

### Latest checks
- Typecheck: passed
- Lint: passed
- Tests: 47 passed (unit + integration)
- Production build: passed
- Prisma migration status: database is up to date (17 migrations applied)
- Local PostgreSQL running on port 5433 (Docker Compose)
- Temporary disposable PostgreSQL on port 5434 used for integration testing; container removed after testing.

## Not completed
- RBAC seed row counts not yet verified against database; no active login account provisioned; sign-in/closed-signup not tested end-to-end.
- Item master UI (create/edit items) not implemented.
- BOM draft creation/edit UI not implemented (only read/explosion UI).
- Procurement UI (purchase request/order screens, goods receipt UI) not implemented.
- Manufacturing Orders UI (create/release MO, work order execution screen) not implemented.
- Quality Control UI just added - login required, permission check implemented, but form not yet connected to API.
- Inventory UI (stock balances, receipts, issues) just added - API endpoints exist but UI not connected.
- Reporting dashboard (costing, inventory valuation, production variance) not implemented.
- No Neon cloud connection tested; no credentials provided.
- No E2E Playwright tests written.
- No reproducible seed data for demo furniture manufacturing scenario.
- Deterministic seed script not yet written.

## Risks and blockers
- Local Compose PostgreSQL on port 5433 because host port 5432 was allocated; volume is `bom_manufactureos-postgres`.
- Domain explosion accepts caller-provided BOM catalog; repository must select only approved/effective revisions before planning or MO release.
- Dedicated UOM conversion administration service needed to guarantee stored conversion records remain dimension-compatible.
- Better Auth adapter schema (role, banned, banReason, banExpires on User; impersonatedBy on Session) added to Prisma schema but migration must be applied to local DB.

## Next slice
1. Verify local Compose database is running and all 17 migrations applied.
2. Implement master data UI (item master CRUD) and BOM editor UI.
2. Implement Quality Control UI (inspection list, create inspection, post inspection, accepted production receipt).
3. Implement Manufacturing Orders UI (list, create from MRP recommendation, release, material issue).
4. Implement inventory UI (stock balances, goods receipt, material issue).
5. Run end-to-end workflow test: demand → MRP → PO → receipt → MO → issue → work order → QC → accepted receipt → stock/cost reconciliation.
6. Implement production costing reports and inventory valuation reports.
7. Run Playwright E2E tests.
8. Deploy documentation and deployment guide.