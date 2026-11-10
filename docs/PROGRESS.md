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
- Production transactional E2E (8 Nov 2026): released demand, MRP run (`MRP-PROD2-094326`, 10.5 s, 5 buckets / 2 recommendations), SA-001 MO completed (2 materials issued/consumed, work order + time entry, QC posted, production receipt 7), FG-001 MO completed (3 materials issued/consumed, work order + time entry, QC posted, production receipt 4), estimate + actual cost snapshots for all three completed MOs, and reports returned variance and valuation rows.
- Serverless protection: all `/api/v1/**` route handlers export `maxDuration = 60`; serializable transactions use `maxWait 10 s` / `timeout 30 s` to absorb Neon latency.
- Work-order execution is server-guarded: start requires `RELEASED`/`IN_PROGRESS` MO, while time entry, pause, and completion require `IN_PROGRESS`.

## UI/UX & Enterprise Data Matrix (completed)
- UI diterjemahkan sepenuhnya ke **Bahasa Indonesia**: login, navigasi sidebar, semua halaman dashboard (overview, items, engineering/bom-explorer, planning, inventory, procurement, manufacturing, work-orders, receipts, quality, reports, administration, boms/create), tabel, form, badge status, dan alert.
- New design system: `Button`, `Card`, `Badge`/`StatusBadge`, `Field`/`Input`/`Select`/`Textarea`, `Table`, `Stat`/`StatGrid`, `Alert`, `EmptyState`, `PageHeader`, `Tabs`, `Spinner`/`Skeleton` under `src/components/ui/`.
- Reusable `Pagination` component (`src/components/ui/pagination.tsx`): row count ranges, current/total pages, previous/next, and configurable items-per-page selector.
- Shared RFC 4180 / Excel UTF-8 BOM CSV export engine (`src/lib/csv.ts`): handles comma/quote/newline escaping with test coverage (`src/lib/csv.test.ts`).
- Reusable `ExportCsvButton` client component (`src/components/admin/export-csv-button.tsx`) enabling client-side CSV downloads directly from React Server Component panels.
- **Enterprise Pagination, Instant Search & CSV Export Matrix**:
  - **Inventory (`/inventory`)**: Pagination & CSV export on Balances, Reservations, and Movement Ledger.
  - **Items Catalog (`/items`)**: Pagination, SKU search, URL parameter sync (`?sku=`, `?q=`), and CSV export.
  - **Manufacturing Orders (`/manufacturing`)**: Pagination, MO search, URL parameter sync (`?mo=`), and CSV export.
  - **Shop Floor Work Orders (`/manufacturing/work-orders`)**: Status filter tabs, search, pagination, and CSV export.
  - **Manufacturing Materials (`/manufacturing/materials`)**: Component consumption/return/WIP matrix with CSV export.
  - **Production Receipts (`/manufacturing/receipts`)**: Quality-posted finished goods receipts with pagination and CSV export.
  - **Quality Control (`/quality`)**: Search, status filters, pagination, and CSV export on Pending Inspections and Inspection History.
  - **Procurement & Supply Chain (`/procurement`)**: Pagination and CSV export across Purchase Orders (PO), Purchase Requests (PR), and Goods Receipts (GR).
  - **Engineering & BOM Explorer (`/engineering`)**: BOM revision list pagination, search, status filter, and multi-scope CSV export (BOM headers, component lines, exploded batch requirements).
  - **Planning & MRP (`/planning`)**: Production demands pagination, search, and CSV export; MRP recommendations pagination and CSV export; time-phased buckets pagination and CSV export.
  - **Financial & Cost Reports (`/reports`)**: Search and pagination on Production Costs (with expandable material/labor/overhead variance breakdown), Inventory Valuation, and WIP Value, with CSV export.
  - **Administration (`/administration`)**: CSV export across Users, Item Categories, UOMs, Work Centers, Warehouses, Suppliers, and Audit Logs.
- AppShell with sticky header, collapsible sidebar nav (mobile drawer), user profile + sign-out.
- Presentation helpers: `formatDate`, `formatDateTime`, `formatMoney`, `formatQuantity`, `formatRelative`, `todayJakarta`, `truncateId` (`src/lib/format.ts`) — Asia/Jakarta presentation, UTC persistence.
- Verified RBAC assertions: `scripts/check-rbac.ts` tests 100% permission grant (37/37 granular permissions, 8 roles).
- **Server-Side Reporting & Period Filtering (implemented)**: Dedicated `GET /api/v1/reports/costs` endpoint powered by `ManufacturingCostService.getCostReport()`, replacing N+1 client-side HTTP waterfall requests with a single database aggregation query with period date range (`startDate`, `endDate`) and status filtering.
- **Production Receipt Cost Revaluation (implemented)**: `InventoryService.revalueProductionReceipts()` automatically revalues unpriced finished goods / subassembly receipts and updates moving-average stock balance values upon finalization of actual manufacturing order costing in a serializable transaction with audit trail logging.
- **Item Lifecycle & Audit View (implemented)**:
  - Added `ItemService.getItemDetail()` and dedicated `GET /api/v1/items/[id]` endpoint protected by `item.read` permission.
  - Returns complete item master properties, live stock balances across all warehouses, BOM output revisions (MAKE), parent BOM usages (as component), and chronological audit history.
  - Enhanced `ItemService.update()` with automated before-and-after field diff capture in audit metadata (`entityType: "Item"`).
  - Built interactive `ItemLifecycleModal` (`src/components/master-data/item-lifecycle-modal.tsx`) with three dedicated views (Riwayat Audit dengan diff visual, Saldo Persediaan multi-gudang, Keterkaitan Struktur BOM) and per-item audit CSV export.
  - Integrated history action button directly into the Data Barang (`/items`) table.
  - Expanded unit test suite with 4 new tests (`src/modules/master-data/application/item-service.test.ts`), bringing total unit test coverage to 159 passed tests across 26 test suites.

- **Disposable-Database CI & E2E Pipeline (implemented)**:
  - Added `disposable-db-e2e` job in `.github/workflows/ci.yml` powered by a dedicated PostgreSQL 17 service container.
  - Automatically runs `prisma migrate deploy` (all 20 migrations), seeds master data & access control (`prisma:seed`), provisions administrator credentials out-of-band (`admin:create`), checks 37/37 granular RBAC permissions (`rbac:check`), runs all 11 PostgreSQL integration tests, and executes Playwright end-to-end suite (`test:e2e`).
  - Added `"test:e2e": "playwright test"` and configured `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json`.

## Not implemented / not verified
- Custom domain and preview-deployment protection rules are not configured.

## Risks and blockers
- Local Compose PostgreSQL on port 5433 because host port 5432 was allocated; volume `bom_manufactureos-postgres`.
- `src/lib/prisma.ts` selects the Neon adapter unless the connection string contains `localhost`/`127.0.0.1`.
- BOM explosion accepts a caller-provided BOM catalog; repositories must select only approved/effective revisions before planning or MO release.
- Dedicated UOM conversion administration service needed to keep stored conversions dimension-compatible.
- Multi-level MO material explosion configured with `stopAtMake: true` in `ManufacturingService`, ensuring parent MOs consume subassembly inventory (e.g. SA-001) while child MAKE orders produce them without double component deduction.
- Global git credential settings on this machine prompt for a different GitHub identity; pushes use an explicit token URL.

## Next slice
1. Custom domain and preview-deployment protection policy setup when domain is provisioned.
