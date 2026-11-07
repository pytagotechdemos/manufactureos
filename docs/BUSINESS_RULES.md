# Business Rules

## Master data and engineering
- SKU and business document identifiers are unique; referenced master data is deactivated rather than deleted.
- UOM conversions are directed and allowed only within compatible dimensions; reverse factors are never inferred. Calculations use Decimal and round once to target UOM precision with HALF_UP. Missing paths and conflicting multistep factors are rejected.
- BOM lifecycle statuses are Draft, In Review, Approved, and Obsolete. Implemented services permit edits only in Draft and enforce the Draft -> In Review -> Approved flow; only Approved may become Obsolete. Each mutation writes an audit event transactionally.
- PostgreSQL triggers prohibit structural edits or line changes on Approved BOMs. Approved BOMs may only transition to Obsolete.
- BOM output and component quantities must be positive. The explosion service normalizes each level by its BOM output quantity; scrap multiplies component gross need by `1 + scrapRate`. Calculations use decimal arithmetic; scrap must be non-negative.
- Approval requires an effective date, valid active item/UOM references, non-empty lines, and approved BOMs for MAKE components. Cycle checking uses the effective approved revision catalog and is serialized with a PostgreSQL advisory transaction lock.
- The service does not yet implement revision-creation convenience, superseding an old approved revision automatically, or UOM conversion; effective approved revision selection remains necessary in consuming workflows.
- BOM approval rejects direct and indirect cycles and missing/ambiguous child BOM definitions for MAKE subassemblies.
- Confirmed orders retain immutable BOM and routing snapshots.
- Discrete item quantities round upward to the configured lot multiple; divisible quantities retain configured precision. This policy is applied after net requirement calculation.

## Inventory
- Available = on hand - reserved - blocked; blocked is included in on-hand and cannot overlap reserved quantities.
- Purchase orders are expected supply, never physical stock.
- Posted movement ledger entries are immutable. Corrections require reversal or adjustment documents.
- Each posting uses a unique idempotency key and atomically writes source status, ledger, balance, and audit entry.
- No posting may create negative on-hand or reserve more than available, including under concurrent requests.
- Transfer into WIP is not consumption; issue, consumption, transfer, and production receipt are separate events.

## MRP
- The implemented pure calculation engine is deterministic for a fixed snapshot, but persisted run history and recommendation workflows are not implemented yet.
- Available stock passed into the engine must already be net of active reservations and blocked stock; the engine does not query balances itself.
- Confirmed dated supply is netted only on its arrival date or later. Same-day receipts can satisfy same-day needs under the current date-bucket policy; intra-day sequencing is not modeled.
- Plans are deterministic from a captured input snapshot and preserve historical results.
- Supply is allocable only on or before the requirement date; late supply is not netted against earlier needs.
- Reservations reduce available inventory once. Purchase orders are scheduled receipts only at confirmed dates and remaining quantities.
- Demand is propagated down approved BOM levels only for MAKE assemblies not covered by available subassembly supply; BUY items produce purchase recommendations.
- Safety stock is included in target projected balance. Lead time offsets planned release; past release dates are marked infeasible.
- Lot sizing is applied to planned receipts. A run recommends orders and never creates posted procurement documents automatically.

## Procurement
- PO creation/approval does not alter inventory. Posted receipts do.
- Partial receipts are allowed; total received cannot exceed approved line quantity by default.
- Cancelled lines cannot receive further quantities; posted receipts cannot be deleted.

## Manufacturing and quality
- MO transitions follow an explicit state machine; release requires approved snapshots and material policy checks.
- Work operations respect sequence/dependency rules. Pause/resume/time reporting are auditable and idempotent where posting applies.
- Material issue moves stock to WIP; consumption and return reconcile WIP separately.
- Partial output is valid. Target quantity is not required for a legitimate production receipt.
- Every inspection line reconciles inspected = accepted + rejected + rework. Rework is a disposition of existing production and subsequent inspection cannot count it as new output.
- Rejected output is never sellable inventory; only accepted disposition may be received into finished goods.

## Costing and audit
- Cost calculations use Decimal. Current cost snapshots include standard material estimates, WorkCenter standard labor estimates where rates/times exist, and actual labor from time entries at their captured hourly-rate snapshot.
- Actual material costing only uses consumption movements with a captured unit cost; otherwise valuation is marked incomplete with explicit movement IDs rather than fabricated costs.
- Current WIP allocation is a provisional pro-rata allocation of known accumulated cost by produced quantity versus target; moving-average inventory valuation and explicit reject/rework/overhead allocation policies remain incomplete.
- Moving weighted average is updated from posted receipts and issues; no binary floating point is used for persisted calculations.
- Unfinished production cost remains WIP; completed-unit cost does not absorb cost attributable to outstanding work without an explicit allocation policy.
- Sensitive mutations and all inventory/manufacturing postings record actor, source, timestamp, and before/after or event details in audit history.
