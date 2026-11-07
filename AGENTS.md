# ManufactureOS Engineering Instructions

## Scope
ManufactureOS is a modular monolith for discrete manufacturing ERP. Preserve transaction integrity and auditability over UI convenience.

## Commands
- `corepack pnpm dev` — development server
- `corepack pnpm lint` — ESLint
- `corepack pnpm typecheck` — strict TypeScript check
- `corepack pnpm test` — Vitest
- `corepack pnpm build` — production build
- `corepack pnpm prisma:generate` — generate Prisma Client
- `corepack pnpm prisma:migrate` — apply development migration using `DATABASE_URL_UNPOOLED`

## Rules
- Keep business logic in `src/modules`, not route handlers or components.
- All mutations require Zod validation, server-side authorization, transactions where applicable, and auditability.
- Never directly edit posted inventory ledger records or balances outside inventory services.
- Use UTC timestamps in persistence and Asia/Jakarta for presentation.
- Use Prisma Decimal for quantities and money; never use JavaScript floating point for persisted calculations.
- Never expose secrets, session tokens, or database credentials.
- Do not run destructive database commands without owner approval.
- Do not commit, push, deploy, or modify remote databases without owner approval.

## Architecture
Domain modules live under `src/modules`. Private server code belongs under `src/lib` or modules with `server-only` boundaries. Route handlers authenticate, authorize, validate, call an application service, and serialize a response.

## Verification
Every implementation slice must run typecheck, lint, relevant tests, and build where feasible. Documentation must distinguish implemented behavior from planned behavior.
