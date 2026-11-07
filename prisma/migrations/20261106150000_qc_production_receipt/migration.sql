CREATE TYPE "QcInspectionStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

ALTER TABLE "ManufacturingOrder"
  ADD COLUMN "producedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD COLUMN "inspectedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD COLUMN "acceptedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD COLUMN "rejectedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD COLUMN "reworkQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "ManufacturingOrder_output_nonnegative" CHECK ("producedQuantity" >= 0 AND "inspectedQuantity" >= 0 AND "acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0 AND "reworkQuantity" >= 0);

CREATE TABLE "QcInspection" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "manufacturingOrderId" UUID NOT NULL,
  "workOrderId" UUID,
  "defectCode" TEXT,
  "status" "QcInspectionStatus" NOT NULL DEFAULT 'DRAFT',
  "inspectedQty" DECIMAL(19,6) NOT NULL,
  "acceptedQty" DECIMAL(19,6) NOT NULL,
  "rejectedQty" DECIMAL(19,6) NOT NULL,
  "reworkQty" DECIMAL(19,6) NOT NULL,
  "inspectorId" UUID NOT NULL,
  "notes" TEXT,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  CONSTRAINT "QcInspection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QcInspection_quantities_nonnegative" CHECK ("inspectedQty" > 0 AND "acceptedQty" >= 0 AND "rejectedQty" >= 0 AND "reworkQty" >= 0),
  CONSTRAINT "QcInspection_quantity_reconciliation" CHECK ("inspectedQty" = "acceptedQty" + "rejectedQty" + "reworkQty")
);

CREATE UNIQUE INDEX "QcInspection_number_key" ON "QcInspection"("number");
CREATE INDEX "QcInspection_manufacturingOrderId_status_idx" ON "QcInspection"("manufacturingOrderId", "status");
CREATE INDEX "QcInspection_workOrderId_idx" ON "QcInspection"("workOrderId");
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProductionReceipt" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "manufacturingOrderId" UUID NOT NULL,
  "warehouseId" UUID NOT NULL,
  "acceptedQty" DECIMAL(19,6) NOT NULL,
  "inspectionId" UUID,
  "idempotencyKey" TEXT NOT NULL,
  "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "actorId" UUID NOT NULL,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionReceipt_acceptedQty_positive" CHECK ("acceptedQty" > 0)
);
CREATE UNIQUE INDEX "ProductionReceipt_number_key" ON "ProductionReceipt"("number");
CREATE UNIQUE INDEX "ProductionReceipt_idempotencyKey_key" ON "ProductionReceipt"("idempotencyKey");
CREATE INDEX "ProductionReceipt_inspectionId_idx" ON "ProductionReceipt"("inspectionId");
CREATE INDEX "ProductionReceipt_manufacturingOrderId_status_idx" ON "ProductionReceipt"("manufacturingOrderId", "status");
ALTER TABLE "ProductionReceipt" ADD CONSTRAINT "ProductionReceipt_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionReceipt" ADD CONSTRAINT "ProductionReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionReceipt" ADD CONSTRAINT "ProductionReceipt_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QcInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
