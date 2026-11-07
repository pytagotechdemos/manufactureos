CREATE OR REPLACE FUNCTION prevent_approved_bom_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'APPROVED'::"BomStatus" AND (
    NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."outputItemId" IS DISTINCT FROM OLD."outputItemId"
    OR NEW."revision" IS DISTINCT FROM OLD."revision"
    OR NEW."outputQty" IS DISTINCT FROM OLD."outputQty"
    OR NEW."effectiveDate" IS DISTINCT FROM OLD."effectiveDate"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
  ) THEN
    RAISE EXCEPTION 'Approved BOM structure is immutable';
  END IF;

  IF OLD."status" = 'APPROVED'::"BomStatus" AND NEW."status" NOT IN ('APPROVED'::"BomStatus", 'OBSOLETE'::"BomStatus") THEN
    RAISE EXCEPTION 'Approved BOM may only become obsolete';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_approved_bom_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bom_status "BomStatus";
BEGIN
  SELECT "status" INTO bom_status FROM "Bom" WHERE "id" = COALESCE(NEW."bomId", OLD."bomId");
  IF bom_status = 'APPROVED'::"BomStatus" THEN
    RAISE EXCEPTION 'Approved BOM lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER bom_approved_immutability
BEFORE UPDATE ON "Bom"
FOR EACH ROW
EXECUTE FUNCTION prevent_approved_bom_mutation();

CREATE TRIGGER bom_line_approved_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "BomLine"
FOR EACH ROW
EXECUTE FUNCTION prevent_approved_bom_line_mutation();
