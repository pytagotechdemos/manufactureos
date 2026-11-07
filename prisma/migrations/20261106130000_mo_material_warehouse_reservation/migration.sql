ALTER TABLE "ManufacturingOrder"
  ADD COLUMN "warehouseId" UUID NOT NULL;

ALTER TABLE "ManufacturingOrderMaterial"
  ADD COLUMN "reservationId" UUID;

CREATE UNIQUE INDEX "ManufacturingOrderMaterial_reservationId_key" ON "ManufacturingOrderMaterial"("reservationId");
CREATE INDEX "ManufacturingOrder_warehouseId_idx" ON "ManufacturingOrder"("warehouseId");

ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
