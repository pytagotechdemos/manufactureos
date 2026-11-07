ALTER TYPE "StockMovementType" ADD VALUE 'CONSUMPTION';
ALTER TYPE "StockMovementType" ADD VALUE 'RETURN';

ALTER TABLE "ManufacturingOrderMaterial"
  ADD COLUMN "consumedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD COLUMN "returnedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "ManufacturingOrderMaterial_usage_nonnegative" CHECK ("issuedQty" >= 0 AND "consumedQty" >= 0 AND "returnedQty" >= 0),
  ADD CONSTRAINT "ManufacturingOrderMaterial_usage_within_issued" CHECK ("consumedQty" + "returnedQty" <= "issuedQty");
