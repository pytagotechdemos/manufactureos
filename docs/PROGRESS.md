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
- Screens: `/overview`, `/login`, `/items`, `/engineering`, `/boms/create`, `/planning`, `/inventory`, `/procurement`, `/manufacturing`, `/manufacturing/work-orders`, `/manufacturing/materials`, `/manufacturing/receipts`, `/quality`, `/reports`, `/administration`.
- Sidebar navigation includes Items; screens call the `/api/v1/**` endpoints.

### Transactional UI (implemented)
- Item master: create, search/filter, status edit, and activate/deactivate.
- BOM: create draft with header and multi-line component editor; review/approve/obsolete through the engineering explorer.
- Procurement: purchase order creation, approval, goods receipt creation, and posting to stock.
- Planning: MRP run creation and review; manufacturing orders can only be created from MAKE recommendations.
- Manufacturing: plan/release MOs, issue/consume/return materials, execute work orders (work center, start/pause, time entries, completion), and post production receipts from posted QC inspections.
- Inventory: receipts, issues, transfers, adjustments, balance list, and movement history.
- Quality: inspection creation and posting; accepted quantity becomes the source for production receipts.
- Reports: estimated vs actual production cost, variance, inventory valuation, WIP value, and CSV export.

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
- Production build: passed
- Playwright E2E (`tests/e2e/complete-lifecycle.e2e.ts`): 1 passed
- Production sign-in: HTTP 200, session cookie issued, **all 14 key pages return 200** (`/overview`, `/items`, `/boms/create`, `/engineering`, `/procurement`, `/planning`, `/manufacturing`, `/manufacturing/work-orders`, `/manufacturing/materials`, `/manufacturing/receipts`, `/quality`, `/inventory`, `/reports`, `/administration`)

## UI/UX rework (completed)
- UI diterjemahkan sepenuhnya ke **Bahasa Indonesia**: login, navigasi sidebar, semua halaman dashboard (overview, items, engineering/bom-explorer, planning, inventory, procurement, manufacturing, work-orders, receipts, quality, reports, administration, boms/create), tabel, form, badge status, dan alert
- New design system: `Button`, `Card`, `Badge`/`StatusBadge`, `Field`/`Input`/`Select`/`Textarea`, `Table`, `Stat`/`StatGrid`, `Alert`, `EmptyState`, `PageHeader`, `Tabs`, `Spinner`/`Skeleton` under `src/components/ui/`
- New shell: `AppShell` with sticky header, collapsible sidebar nav (mobile drawer), user profile + sign-out
- Login page redesigned (brand panel, consistent inputs/buttons, `role=alert` error banner)
- All dashboard screens wired to real APIs: overview metrics, items, procurement (PO + goods receipt), manufacturing, work orders, quality inspections, inventory balances
- Administration: real users/roles from DB, status badges, create-account form via `POST /api/v1/users`
- Raw UUID text inputs replaced with dropdowns backed by new GET endpoints
- Presentation helpers: `formatDate`, `formatDateTime`, `formatMoney`, `formatQuantity`, `formatRelative`, `truncateId` (`src/lib/format.ts`) — Asia/Jakarta presentation, UTC persistence
- `SearchInput` is a controlled component (`value`/`onChange`); server pages pass initial data to client screens rather than handlers across the RSC boundary
- Added missing GET endpoints: `/api/v1/suppliers`, `/api/v1/uoms`, `/api/v1/categories`, `/api/v1/warehouses`, `/api/v1/roles`, `/api/v1/users` (+POST), `/api/v1/purchase-order-lines`, `/api/v1/procurement/goods-receipts` (GET+POST)

## Not implemented / not verified
- RBAC seed row counts not verified against the database (the seed runs, but no count assertions exist).
- Item deletion is intentionally not exposed; item lifecycle is limited to status changes because historical transactions reference items.
- BOM draft line editing after creation is not exposed; drafts move forward through submit-review/approve/obsolete only.
- Reporting is aggregated client-side over existing APIs; there is no server-side report endpoint or period selector.
- Root-cause variance drill-down (per material/labor line) is not implemented; the reports screen shows MO-level variance only.
- Custom domain and preview-deployment protection rules are not configured.
- E2E runs against whatever `DATABASE_URL` points at (currently Neon); there is no disposable-database variant of it.

## Risks and blockers
- Local Compose PostgreSQL on port 5433 because host port 5432 was allocated; volume `bom_manufactureos-postgres`.
- `src/lib/prisma.ts` selects the Neon adapter unless the connection string contains `localhost`/`127.0.0.1`.
- BOM explosion accepts a caller-provided BOM catalog; repositories must select only approved/effective revisions before planning or MO release.
- Dedicated UOM conversion administration service needed to keep stored conversions dimension-compatible.
- Global git credential settings on this machine prompt for a different GitHub identity; pushes use an explicit token URL.

## Next slice
1. Add count/consistency assertions for the RBAC seed.
2. Add period filters and a server-side report endpoint; add per-material/per-labor variance drill-down.
3. Add editable BOM drafts and an explicit item lifecycle audit view.
4. Add a disposable-database E2E job to CI.
5. Add a custom domain and decide preview-deployment protection.
