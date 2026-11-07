# Architecture Decisions

## ADR-001: Modular monolith
**Status:** Accepted. Keep domains in a single Next.js/TypeScript application with explicit `src/modules` boundaries. This meets MVP needs while keeping services extractable later; microservices and NestJS are out of scope.

## ADR-002: PostgreSQL as system of record
**Status:** Accepted. Neon PostgreSQL is production target; local PostgreSQL is used for isolated development/integration. SQLite and mock persistence are prohibited. Prisma ORM 7 is the sole ORM.

## ADR-003: Prisma runtime adapter and URLs
**Status:** Accepted. Use `@prisma/adapter-neon` with pooled `DATABASE_URL` for app runtime. Prisma CLI uses direct `DATABASE_URL_UNPOOLED` through `prisma.config.ts`. Credentials are not committed.

## ADR-004: Decimal inventory and money
**Status:** Accepted. Store quantities and monetary values in PostgreSQL numeric/Prisma Decimal, never binary floating point. Rounding is explicit per item/UOM policy.

## ADR-005: Inventory ledger authority
**Status:** Accepted. Append-only posted movements are authoritative history; balances are transactionally maintained projections. Posting source, balance, idempotency, and audit record share a transaction. Corrections use reversals/adjustments.

## ADR-006: Planning creates recommendations
**Status:** Accepted. MRP snapshots inputs and stores deterministic recommendations; it does not automatically post real purchase orders or manufacturing orders.

## ADR-007: Authentication and closed provisioning
**Status:** Accepted. Better Auth with Prisma adapter handles authentication. Public registration is disabled; administrator provisioning is required. Domain permissions are server-checked.

## ADR-008: Initial valuation policy
**Status:** Accepted. Moving weighted-average inventory cost for the MVP; manufacturing WIP and rework allocation limitations must be explicit in cost reporting.

## ADR-009: Framework baseline
**Status:** Accepted with caveat. Scaffold uses Next.js 15.5.9, React 19.1, Tailwind 4, TypeScript 5.9, Node 24. Exact package versions are pinned/resolved for reproducibility. Upgrade decision is revisited after compatibility checks, not via unbounded `latest` installs.
