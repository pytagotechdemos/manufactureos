CREATE TYPE "ManufacturingCostSnapshotType" AS ENUM ('ESTIMATE', 'ACTUAL');

CREATE TABLE "ManufacturingCostSnapshot" (
  "id" UUID NOT NULL,
  "manufacturingOrderId" UUID NOT NULL,
  "type" "ManufacturingCostSnapshotType" NOT NULL,
  "materialCost" DECIMAL(19,4) NOT NULL,
  "laborCost" DECIMAL(19,4) NOT NULL,
  "overheadCost" DECIMAL(19,4) NOT NULL,
  "totalCost" DECIMAL(19,4) NOT NULL,
  "wipCost" DECIMAL(19,4) NOT NULL,
  "completedCost" DECIMAL(19,4) NOT NULL,
  "costPerAcceptedUnit" DECIMAL(19,4),
  "valuationComplete" BOOLEAN NOT NULL,
  "unvaluedReferences" JSONB NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingCostSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingCostSnapshot_amounts_nonnegative" CHECK ("materialCost" >= 0 AND "laborCost" >= 0 AND "overheadCost" >= 0 AND "totalCost" >= 0 AND "wipCost" >= 0 AND "completedCost" >= 0)
);

CREATE INDEX "ManufacturingCostSnapshot_manufacturingOrderId_type_createdAt_idx" ON "ManufacturingCostSnapshot"("manufacturingOrderId", "type", "createdAt");
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
