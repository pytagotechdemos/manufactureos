ALTER TABLE "UomConversion"
  ADD CONSTRAINT "UomConversion_factor_positive" CHECK ("factor" > 0),
  ADD CONSTRAINT "UomConversion_distinct_units" CHECK ("fromUomId" <> "toUomId");
