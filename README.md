# ManufactureOS

Modular-monolith manufacturing ERP for discrete manufacturing: demand → BOM planning → MRP → procurement → inventory → manufacturing → quality → costing.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19 |
| Language | TypeScript (strict) |
| Database | PostgreSQL — local via Docker Compose, production on Neon |
| ORM | Prisma 7 with driver adapters (`@prisma/adapter-neon`, `@prisma/adapter-pg`) |
| Auth | Better Auth (closed email/password, admin plugin) |
| Validation | Zod |
| Styling | Tailwind CSS 4 |
| Tests | Vitest (unit/integration), Playwright (E2E) |

## Principles

- Business logic lives in `src/modules`, never in route handlers or components.
- Every mutation is Zod-validated, server-side authorized, transactional where applicable, and audit-logged.
- Approved BOMs are immutable, enforced by PostgreSQL triggers — not just application code.
- Quantities and money use Prisma `Decimal`; no JavaScript floats for persisted calculations.
- Timestamps persist in UTC and present in `Asia/Jakarta`.
- Inventory ledger records and balances are only written by inventory services.

## Getting started

```bash
corepack pnpm install          # also runs `prisma generate` via postinstall
corepack pnpm prisma:migrate   # apply migrations (uses DATABASE_URL_UNPOOLED)
corepack pnpm prisma:seed      # deterministic furniture scenario
corepack pnpm dev
```

Local PostgreSQL:

```bash
docker compose up -d
```

Provision the first administrator (registration is disabled):

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<min 12 chars>' \
  corepack pnpm exec tsx scripts/create-admin.ts
```

## Commands

| Command | Purpose |
| --- | --- |
| `corepack pnpm dev` | development server |
| `corepack pnpm lint` | ESLint |
| `corepack pnpm typecheck` | strict TypeScript check |
| `corepack pnpm test` | Vitest |
| `corepack pnpm build` | production build |
| `corepack pnpm prisma:generate` | generate Prisma Client |
| `corepack pnpm prisma:migrate` | apply development migration |

## Environment

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | pooled runtime connection (Neon or local) |
| `DATABASE_URL_UNPOOLED` | direct connection for Prisma CLI and migrations |
| `BETTER_AUTH_SECRET` | ≥ 32 characters |
| `BETTER_AUTH_URL` | canonical app URL (e.g. `https://your-app.vercel.app`) |

## Verification

Implemented behavior is covered by `corepack pnpm test` (Vitest) and `corepack pnpm typecheck` / `lint` / `build`. Planned-but-not-yet-implemented work is tracked in [`docs/PROGRESS.md`](docs/PROGRESS.md); design documents in [`docs/`](docs/) distinguish implemented from planned behavior.
