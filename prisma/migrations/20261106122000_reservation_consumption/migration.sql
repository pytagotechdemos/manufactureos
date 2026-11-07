ALTER TABLE "StockReservation"
  ADD COLUMN "consumedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "StockReservation_consumed_within_reserved" CHECK ("consumedQty" >= 0 AND "consumedQty" <= "quantity");
