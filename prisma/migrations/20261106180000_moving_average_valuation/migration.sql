CREATE TYPE "CostValuationStatus" AS ENUM ('VALUED', 'UNVALUED', 'NOT_APPLICABLE');

ALTER TABLE "StockBalance"
  ADD COLUMN "onHandValue" DECIMAL(19,4) NOT NULL DEFAULT 0,
  ADD COLUMN "averageUnitCost" DECIMAL(19,4),
  ADD COLUMN "valuationComplete" BOOLEAN NOT NULL DEFAULT true;
UPDATE "StockBalance" SET "valuationComplete" = false WHERE "onHand" > 0;

ALTER TABLE "StockMovement"
  ADD COLUMN "costStatus" "CostValuationStatus" NOT NULL DEFAULT 'UNVALUED';
UPDATE "StockMovement" SET "costStatus" = CASE WHEN "unitCost" IS NULL THEN 'UNVALUED'::"CostValuationStatus" ELSE 'VALUED'::"CostValuationStatus" END;
