# Domain Model

## Identity
User, Session, Role, Permission, UserRole, RolePermission, AuditLog. User provisioning is closed; roles grant permissions but services authorize permission identifiers rather than trusting client-supplied roles.

## Master data
Item, ItemCategory, UnitOfMeasure, UomConversion, Supplier, Warehouse, WorkCenter. UOM conversions store directed positive factors; reverse conversions are not inferred. Conversion paths use exact decimal multiplication and fail on incompatible dimensions, missing paths, or conflicting path factors. Items have unique SKU, type, MAKE/BUY supply type, base UOM, lifecycle state, planning parameters, and cost attributes. Referenced records are archived/deactivated, not deleted.

## Engineering
BOM and BOMLine use revisions. Persisted lifecycle statuses are Draft, In Review, Approved, and Obsolete; draft revisions are mutable and approved revisions are intended to be immutable. Each line references a component and quantity per BOM output quantity, plus scrap. Routing and RoutingStep define ordered operations and work centers. The pure BOM explosion service handles decimal normalization, scrap, MAKE/BUY traversal, aggregation, missing/ambiguous child BOMs, and cycle detection. Approval enforcement and effective-revision selection are not implemented yet.

## Planning
ProductionDemand and lines represent dated independent demand. MRPRun stores immutable input/output snapshots. MRPLine represents time-phased gross demand, scheduled receipt, projected balance, net need, and proposed order; MRP supply allocations prevent the same dated supply being claimed twice within a run.

## Procurement
PurchaseRequest/lines, PurchaseOrder/lines, request-order allocations, GoodsReceipt/lines. Receipts are independently posted and mapped to PO lines, allowing partial receipts with quantity reconciliation.

## Inventory
StockBalance is a transactionally maintained projection by item/location; StockReservation and blocked quantity govern availability; StockMovement is an append-only source-referenced ledger. Transfer, adjustment, issue, receipt, and production output are distinct source events. On hand includes blocked stock; available = on hand - reserved - blocked.

## Manufacturing and quality
ManufacturingOrder retains BOM/routing snapshots and target/completed/accepted/rejected quantities. ManufacturingOrderMaterial tracks planned/allocated/issued quantities. WorkOrder and time entries represent execution. MaterialIssue, MaterialConsumption, and ProductionReceipt separate reservation, movement to WIP, consumption, and output. QCInspection and lines enforce inspected = accepted + rejected + rework; rework inspection references the original lot and does not inflate production output.

## Costing
ItemCost stores moving weighted-average valuation. ManufacturingCostEntry records estimated/actual material, labor, and overhead against orders. WIP remains capitalized as accumulated uncompleted cost; accepted-unit cost excludes cost still assigned to WIP under documented allocation policy.

## Cross-cutting invariants
Business document numbers are unique; UUIDs are primary keys; posted transactions have actor, timestamp, unique idempotency identity, source document, and audit record. Decimal values use PostgreSQL numeric. Historical transaction references restrict deletion.
