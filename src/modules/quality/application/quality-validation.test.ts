import { describe, expect, it } from "vitest";
import { productionReceiptCreateSchema, qcInspectionCreateSchema } from "./quality-validation";

describe("Quality validation schemas", () => {
  const dummyUuid1 = "11111111-1111-4111-8111-111111111111";
  const dummyUuid2 = "22222222-2222-4222-8222-222222222222";
  const dummyUuid3 = "33333333-3333-4333-8333-333333333333";

  it("accepts balanced inspection quantities where inspected = accepted + rejected + rework", () => {
    const valid = {
      number: "QC-2026-001",
      manufacturingOrderId: dummyUuid1,
      inspectedQty: "100",
      acceptedQty: "90",
      rejectedQty: "8",
      reworkQty: "2",
      defectCode: "SURFACE_SCRATCH",
    };
    expect(qcInspectionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unbalanced inspection quantities", () => {
    const unbalanced = {
      number: "QC-2026-002",
      manufacturingOrderId: dummyUuid1,
      inspectedQty: "100",
      acceptedQty: "90",
      rejectedQty: "5",
      reworkQty: "0",
    };
    const result = qcInspectionCreateSchema.safeParse(unbalanced);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Inspected quantity must equal accepted + rejected + rework");
    }
  });

  it("validates valid production receipt create schema", () => {
    const valid = {
      number: "PR-2026-001",
      manufacturingOrderId: dummyUuid1,
      inspectionId: dummyUuid2,
      warehouseId: dummyUuid3,
      acceptedQty: "90",
      idempotencyKey: "receipt-idemp-12345",
    };
    expect(productionReceiptCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-positive production receipt quantity", () => {
    const invalid = {
      number: "PR-2026-002",
      manufacturingOrderId: dummyUuid1,
      inspectionId: dummyUuid2,
      warehouseId: dummyUuid3,
      acceptedQty: "0",
      idempotencyKey: "receipt-idemp-12345",
    };
    expect(productionReceiptCreateSchema.safeParse(invalid).success).toBe(false);
  });
});
