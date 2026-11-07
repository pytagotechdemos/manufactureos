# Architecture

## System shape
ManufactureOS is a Next.js App Router modular monolith. Server Components render read-heavy views; Route Handlers under `/api/v1` form thin HTTP boundaries; application services in `src/modules` own use cases and invariants; Prisma repositories provide persistence.

```text
Browser
  -> Next.js pages / Server Components
  -> Route Handlers (/api/v1)
  -> auth + permission checks
  -> Zod input schemas
  -> domain application services
  -> Prisma repositories / transactional services
  -> PostgreSQL (Neon production, isolated local PostgreSQL for development)
```

## Boundaries
- `src/modules/<domain>`: policies, schemas, services, repositories, and domain tests.
- `src/lib`: database client, authentication, errors, permissions, configuration.
- `src/components`: reusable UI only; no business calculations.
- `src/app`: composition, page routing, thin API adapters.
- `prisma`: physical schema, migrations, deterministic seed.
- `tests`: unit, integration, and Playwright workflows.

## Persistence
Runtime selects `@prisma/adapter-neon` for Neon hostnames and `@prisma/adapter-pg` for localhost development using pooled/runtime `DATABASE_URL`. Prisma CLI uses direct `DATABASE_URL_UNPOOLED` through `prisma.config.ts`. PostgreSQL is authoritative; no client-side database access or mock persistence is permitted. Local Compose maps host port 5433 because 5432 was already allocated.

## Transaction policy
Inventory posting, reservations, receipts, issues, transfers, production receipts, status transitions, and audit records execute in one database transaction. Inventory balances are protected by conditional updates/row locking and ledger records are append-only. Corrections use explicit reversals or adjustments.

## Security
Better Auth owns secure sessions and the Prisma adapter persists auth records. Mutations authenticate, authorize a granular permission, validate with Zod, and write audit information. Secrets and session material are excluded from logs and responses.

## Data flow
Demand selects an approved effective BOM. MRP explodes the BOM against dated supply and reservations, then creates recommendations only. Procurement receipts create inventory movements. Released manufacturing orders retain BOM and routing snapshots. Material issue, consumption, work execution, QC disposition, accepted production receipt, and costing entries are traceable to source documents.

## Deliberate MVP limits
One company and plant, weighted-average inventory valuation, practical finite time-phased MRP, basic routing dependencies, and simple reject/rework. These limits are explicit so later scheduling and accounting extensions do not undermine current invariants.
