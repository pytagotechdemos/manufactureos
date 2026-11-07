# Progress

## Current phase
Phase 7 — Deployment & end-to-end verification (in progress)

## Completed

### Foundation
- Next.js App Router + TypeScript strict, Tailwind, ESLint, Vitest, Playwright, Docker Compose PostgreSQL.
- Prisma 7 with driver adapters (`PrismaPg` for localhost, `PrismaNeon` otherwise) selected at runtime in `src/lib/prisma.ts`.
- `prisma.config.ts` routes migrations through `DATABASE_URL_UNPOOLED`.

### Authentication & Authorization (Phase 1)
- Closed email/password auth via Better Auth; public signup disabled (`disableSignUp: true`).
- Better Auth route handler at `/api/auth/[...all]`; login UI at `/login`.
- Admin plugin: `role`, `banned`, `banReason`, `banExpires` on `users`; `impersonatedBy` on `sessions`.
- Server-side session and permission checks in `src/lib/auth-session.ts` and `src/lib/authorize.ts`.
- Role/permission seed (8 roles, granular permissions) in `prisma/seed-access-control.ts`.
- PostgreSQL trigger migration enforcing approved BOM immutability at the database level.
- **Implemented:** `advanced.database.generateId: "uuid"` in `src/lib/auth.ts` so Better Auth ids match `@db.Uuid` columns (default id generator emits 32-char base64url strings that Postgres rejects).

### Master Data & BOM (Phase 2)
- Item master, UOM conversion, BOM lifecycle (Draft/In Review/Approved/Obsolete), audit entities.
- Pure BOM explosion service (Decimal): batch normalization, nested MAKE explosion, BUY leaf requirements, scrap, shared aggregation, cycle detection, missing/ambiguous BOM errors.
- Transactional BOM lifecycle service: draft create/edit, review submission, approval, obsolescence.

### Inventory Foundation (Phase 3)
- Stock ledger, balances, reservations, transfers, adjustments, immutable movement ledger.
- Availability = On Hand − Reserved − Blocked.
- Atomic posting with idempotency keys, concurrency-safe conditional updates, reversal/adjustment support; WIP transfer distinct from consumption.

### Procurement & MRP (Phase 4)
- Production demand, purchase requests/lines, purchase orders/lines, goods receipts/lines.
- Deterministic time-phased MRP engine: dated supply, reservations, lead times, safety stock, lot sizing, BUY/MAKE logic, multi-level propagation.
- Partial goods receipts, over-receipt prevention, cancellation protection.

### Manufacturing Execution (Phase 5)
- MO with BOM/routing snapshots and lifecycle Draft → Planned → Released → In Progress → QC Pending → Completed.
- Work orders with start/pause/complete, time entries, material reservation/issue/consumption, partial output.

### Quality Control & Costing (Phase 6)
- QC inspection with accepted/rejected/rework reconciliation; accepted output posted to FG stock; rejected output blocked.
- Estimated cost (BOM material × standard cost + routing labor × work-center rate + overhead) and actual cost (consumption at valuation cost, recorded labor, overhead, WIP capitalization).
- Moving weighted-average inventory valuation policy.

### User interface
- Screens: `/overview`, `/login`, `/items`, `/engineering`, `/boms/create`, `/planning`, `/inventory`, `/procurement`, `/manufacturing`, `/manufacturing/work-orders`, `/manufacturing/receipts`, `/quality`, `/reports`, `/administration`.
- Sidebar navigation includes Items; screens call the `/api/v1/**` endpoints.

### Data & operations
- Deterministic seed `prisma/seed.ts`: 5 items, 2 approved BOMs, UOMs, categories, supplier, 2 warehouses, 3 work centers, stock balances. BOM lines are inserted while the BOM is `DRAFT` and the BOM is approved afterwards, because the immutability trigger rejects `INSERT` into `BomLine` for approved parents.
- `scripts/create-admin.ts` provisions the first administrator (registration is closed).

### Deployment (implemented)
- PostgreSQL: Neon, 20 migrations applied with `prisma migrate deploy`, seed data loaded, admin user provisioned.
- Access control seeded by `prisma/seed-access-control.ts` (8 roles, granular permissions); `scripts/create-admin.ts` grants the administrator `SUPER_ADMIN`.
- GitHub: public repository `pytagotechdemos/manufactureos` (`.env*` ignored; only `.env.example` committed).
- Vercel: project `manufactureos` linked to the GitHub repository (push-to-deploy), env vars `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` set for production and preview.
- Production URL: `https://manufactureos-six.vercel.app` — serves the app and redirects `/` to `/login`.

### Verification (implemented)
- Typecheck: passed
- Lint: passed (0 errors; 7 unused-variable warnings in `prisma/seed.ts`)
- Unit/integration tests: 47 passed, 10 skipped
- Production build: passed (42 routes)
- Playwright E2E (`tests/e2e/complete-lifecycle.e2e.ts`): 1 passed
- Production sign-in: HTTP 200, session cookie issued, **all 10 key pages return 200** (`/overview`, `/items`, `/procurement`, `/manufacturing`, `/manufacturing/work-orders`, `/quality`, `/inventory`, `/reports`, `/administration`, `/boms/create`)

## UI/UX rework (completed)
- New design system: `Button`, `Card`, `Badge`/`StatusBadge`, `Field`/`Input`/`Select`/`Textarea`, `Table`, `Stat`/`StatGrid`, `Alert`, `EmptyState`, `PageHeader`, `Tabs`, `Spinner`/`Skeleton` under `src/components/ui/`
- New shell: `AppShell` with sticky header, collapsible sidebar nav (mobile drawer), user profile + sign-out
- Login page redesigned (brand panel, consistent inputs/buttons, `role=alert` error banner)
- All dashboard screens wired to real APIs: overview metrics, items, procurement (PO + goods receipt), manufacturing, work orders, quality inspections, inventory balances
- Administration: real users/roles from DB, status badges, create-account form via `POST /api/v1/users`
- Raw UUID text inputs replaced with dropdowns backed by new GET endpoints
- Presentation helpers: `formatDate`, `formatDateTime`, `formatMoney`, `formatQuantity`, `formatRelative`, `truncateId` (`src/lib/format.ts`) — Asia/Jakarta presentation, UTC persistence
- Fixed RSC boundary error: `SearchInput` manages value internally so event handlers aren't passed across Server/Client Component boundary
- Added missing GET endpoints: `/api/v1/suppliers`, `/api/v1/uoms`, `/api/v1/categories`, `/api/v1/warehouses`, `/api/v1/roles`, `/api/v1/users` (+POST), `/api/v1/purchase-order-lines`, `/api/v1/procurement/goods-receipts` (GET+POST)

## Not implemented / not verified
- RBAC seed row counts not verified against the database (the seed runs, but no count assertions exist).
- Screens are mostly list/read views: item master create/edit, BOM draft editing UI, purchase order/goods receipt forms, MO creation from MRP, work-order execution forms, QC form-to-API wiring, inventory receipt/issue forms.
- Reporting dashboard beyond the current `/reports` screen (costing, inventory valuation, production variance) not implemented.
- Custom domain, preview-deployment protection rules, and CI pipeline not configured.
- E2E runs against whatever `DATABASE_URL` points at (currently Neon); there is no disposable-database variant of it.

## Risks and blockers
- Local Compose PostgreSQL on port 5433 because host port 5432 was allocated; volume `bom_manufactureos-postgres`.
- `src/lib/prisma.ts` selects the Neon adapter unless the connection string contains `localhost`/`127.0.0.1`.
- BOM explosion accepts a caller-provided BOM catalog; repositories must select only approved/effective revisions before planning or MO release.
- Dedicated UOM conversion administration service needed to keep stored conversions dimension-compatible.
- Global git credential settings on this machine prompt for a different GitHub identity; pushes use an explicit token URL.

## Next slice
1. Add count/consistency assertions for the RBAC seed.
2. Complete the remaining CRUD forms (items, BOM draft editing, procurement, MO/work order, QC, inventory).
3. Add production costing and inventory valuation reporting.
4. Add CI (typecheck/lint/test/build) and a deployment guide; consider a disposable-database E2E job.
5. Add a custom domain and decide preview-deployment protection.
