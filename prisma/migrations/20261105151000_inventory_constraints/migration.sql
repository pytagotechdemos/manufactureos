ALTER TABLE "StockBalance"
  ADD CONSTRAINT "StockBalance_nonnegative" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "blocked" >= 0),
  ADD CONSTRAINT "StockBalance_reservation_within_unblocked_stock" CHECK ("reserved" + "blocked" <= "onHand");

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockMovement_source_required" CHECK (length(trim("sourceType")) > 0 AND length(trim("sourceId")) > 0);

ALTER TABLE "StockReservation"
  ADD CONSTRAINT "StockReservation_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockReservation_source_required" CHECK (length(trim("sourceType")) > 0 AND length(trim("sourceId")) > 0);
