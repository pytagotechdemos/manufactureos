# API Contracts

All endpoints use `/api/v1`, JSON, authenticated sessions, server-side permissions, Zod validation, and standardized errors:

```json
{"error":{"code":"VALIDATION_ERROR","message":"The request is invalid","details":[]}}
```

Unexpected failures return a generic `INTERNAL_ERROR` and a correlation ID; internal details and secrets are never returned. List endpoints use `limit` (default 50, maximum 100), opaque `cursor`, and filters; responses provide `{data, nextCursor}`. Mutations accept an `Idempotency-Key` for posting operations.

| Endpoint | Permission | Contract intent |
|---|---|---|
| `GET /boms` | `bom.read` | Filter by output item/status/search; offset pagination |
| `POST /boms` | `bom.create` | Create a validated draft BOM; status is assigned by server |
| `GET /boms/:id` | `bom.read` | Read BOM header and ordered component lines |
| `PATCH /boms/:id` | `bom.create` | Replace draft fields/lines only; approved revisions are immutable |
| `GET /boms/:id/explosion` | `bom.read` | Server-selected approved/effective child BOMs; quantity query defaults to 1 |
| `POST /boms/:id/submit-review` | `bom.create` | Draft -> In Review transition |
| `POST /boms/:id/approve` | `bom.approve` | Approve eligible revision; transactionally validates cycle and effective children |
| `POST /boms/:id/obsolete` | `bom.approve` | Obsolete an approved revision |
| `GET /inventory/balances` | `inventory.read` | Query server-calculated on-hand/reserved/blocked/available balances |
| `GET /inventory/movements` | `inventory.read` | Query immutable source-linked movement history |
| `POST /inventory/receipts` | `inventory.receive` | Idempotently post positive stock receipt |
| `POST /inventory/issues` | `inventory.issue` | Idempotently issue only currently available stock |
| `POST /inventory/reservations` | `inventory.reserve` | Atomically reserve currently available stock |
| `POST /inventory/reservations/:id/release` | `inventory.reserve` | Release an active reservation and update balance |
| `POST /inventory/transfers` | `inventory.transfer` | Atomically move available stock between two active warehouses |
| `POST /inventory/adjustments` | `inventory.adjust` | Post an auditable increase/decrease adjustment |
| `POST /inventory/blocked-stock` | `inventory.adjust` | Block or unblock on-hand stock without changing on-hand quantity |
| `GET /manufacturing/orders` | `manufacturing_order.read` | List manufacturing orders by status |
| `POST /manufacturing/orders` | `manufacturing_order.create` | Create MO from MAKE recommendation, effective BOM snapshot, and exploded material requirements |
| `POST /manufacturing/orders/:id/plan` | `manufacturing_order.plan` | Draft -> Planned transition |
| `POST /manufacturing/orders/:id/release` | `manufacturing_order.release` | Planned -> Released transition and audit |
| `GET /planning/demands` | `production_demand.read` | List production demand documents and lines |
| `POST /planning/demands` | `production_demand.create` | Create draft dated production demand |
| `POST /planning/demands/:id/release` | `production_demand.release` | Release demand for planning |
| `GET /planning/mrp-runs` | `mrp.run` | List immutable MRP run history |
| `POST /planning/mrp-runs` | `mrp.run` | Run deterministic planning against current snapshot and persist buckets/recommendations |
| `GET /planning/mrp-runs/:id` | `mrp.run` | Read snapshot, dated buckets, recommendations, and source demand trace |
| `GET /procurement/purchase-requests` | `purchase_request.read` | List purchase requests with status filter and pagination |
| `POST /procurement/purchase-requests` | `purchase_request.create` | Create validated draft request with item/UOM references |
| `POST /procurement/purchase-requests/:id/approve` | `purchase_request.approve` | Approve request before PO allocation |
| `GET /procurement/purchase-orders` | `purchase_order.read` | List purchase orders with status filter and pagination |
| `POST /procurement/purchase-orders` | `purchase_order.create` | Create draft PO with validated supplier/warehouse/items and precise price quantities |
| `POST /procurement/purchase-orders/:id/approve` | `purchase_order.approve` | Approve draft PO; does not change stock |
| `POST /procurement/goods-receipts` | `purchase_order.create` | Create draft receipt for approved PO lines; permit partial quantities |
| `POST /procurement/goods-receipts/:id/post` | `inventory.receive` | Idempotently post receipt; atomically update PO received quantities and inventory ledger/balance |
| `GET /items` | `item.read` | Filter/search/paginate items |
| `POST /items` | `item.create` | Validated item master fields; server assigns identity/state |
| `GET /boms` | `bom.read` | Filter by output, revision, and status |
| `POST /boms` | `bom.create` | Create draft header/lines; never accept approved status |
| `POST /boms/:id/approve` | `bom.approve` | Approve eligible draft revision transactionally |
| `GET /boms/:id/explosion` | `bom.read` | Return normalized recursive requirement tree |
| `POST /mrp/runs` | `mrp.run` | Capture demand/date inputs and persist recommendation snapshot |
| `GET /inventory/balances` | `inventory.read` | Query balances; available is server-calculated |
| `GET /inventory/movements` | `inventory.read` | Source-linked immutable history |
| `POST /purchase-requests` | `purchase_request.create` | Create validated draft request |
| `POST /purchase-orders` | `purchase_order.create` | Create order from authorized request/supplier selection |
| `POST /goods-receipts/:id/post` | `inventory.receive` | Idempotently post reconciled receipt |
| `POST /manufacturing-orders` | `manufacturing_order.create` | Create MO with server-selected approved snapshots |
| `POST /manufacturing-orders/:id/release` | `manufacturing_order.release` | Validate and release MO |
| `POST /material-issues/:id/post` | `inventory.issue` | Idempotently transfer issued material to WIP |
| `POST /work-orders/:id/start` | `work_order.execute` | Start eligible operation |
| `POST /work-orders/:id/complete` | `work_order.execute` | Validate output and operation dependencies |
| `POST /qc-inspections` | `qc.inspect` | Validate inspected/accepted/rejected/rework reconciliation |
| `POST /production-receipts/:id/post` | `inventory.receive` | Post only accepted production to FG stock |

Clients cannot submit trusted balances, calculated costs, approval states, or role assignments. Exact schemas will be added with their corresponding vertical slice; this document records intended contracts, not implemented endpoints.
