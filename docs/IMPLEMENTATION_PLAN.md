# Implementation Plan

## Phase 0 — Repository audit and architecture
- Inspect repository and preserve existing user work.
- Record requirements, architecture, logical data model, invariants, workflows, API intent, ADRs, tests, and progress.
- Exit only when assumptions and risks are explicit.

## Phase 1 — Project foundation
- Next.js App Router, TypeScript strict, Tailwind, shared application shell.
- Prisma 7/PostgreSQL config, Neon adapter, Better Auth Prisma adapter, role/permission schema.
- Environment template, local PostgreSQL Compose, deterministic seed, lint/typecheck/test/build scripts.
- Verify live database operations only with isolated local PostgreSQL or authorized dev Neon branch.

## Phase 2 — Master data and BOM
- Item/UOM/supplier/location/work-center APIs and usable UI.
- Draft BOM editing, revisions, approval, recursive explosion and cost estimate.
- Unit tests for normalization, cycles, nested quantities, scrap, rounding, and revisions.

## Phase 3 — Inventory foundation
- Ledger, balances, reservations, transfers, adjustments, history, posting/idempotency.
- Integration tests for atomicity, negative stock prevention, reversals, and concurrency.

## Phase 4 — Procurement and MRP
- Dated demand and deterministic time-phased planning.
- Purchase requests/orders, partial receipts, and recommendations.

## Phase 5 — Manufacturing execution
- Snapshot MOs, routing work orders, reservations/issues, consumption, WIP, partial outputs.

## Phase 6 — Quality, costing, reports
- QC/rework, accepted production receipt, weighted average costing, WIP reconciliation, reports.

## Phase 7 — Hardening
- Security, performance, accessibility, comprehensive test flows, dependency review, deployment documentation.

Each slice updates actual status in `PROGRESS.md`; phase gates are not inferred from scaffolding or a successful compile.
