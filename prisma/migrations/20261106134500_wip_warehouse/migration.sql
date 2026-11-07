ALTER TABLE "Warehouse" ADD COLUMN "isWip" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ManufacturingOrder" ADD COLUMN "wipWarehouseId" UUID;
UPDATE "ManufacturingOrder" SET "wipWarehouseId" = "warehouseId" WHERE "wipWarehouseId" IS NULL;
ALTER TABLE "ManufacturingOrder" ALTER COLUMN "wipWarehouseId" SET NOT NULL;

CREATE INDEX "ManufacturingOrder_wipWarehouseId_idx" ON "ManufacturingOrder"("wipWarehouseId");
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_wipWarehouseId_fkey" FOREIGN KEY ("wipWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
