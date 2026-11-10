import { describe, expect, it } from "vitest";
import { demandListSchema, mrpRunSchema, productionDemandCreateSchema } from "./planning-validation";

describe("Planning validation schemas", () => {
  const dummyUuid1 = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const dummyUuid2 = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

  it("validates valid production demand with multiple lines", () => {
    const valid = {
      number: "DEMAND-2026-001",
      lines: [
        {
          itemId: dummyUuid1,
          quantity: "25.5",
          requiredDate: new Date("2026-12-01T00:00:00Z"),
        },
        {
          itemId: dummyUuid2,
          quantity: "10",
          requiredDate: "2026-12-15",
        },
      ],
    };
    expect(productionDemandCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects production demand without lines or with zero quantity", () => {
    expect(productionDemandCreateSchema.safeParse({ number: "DEMAND-001", lines: [] }).success).toBe(false);

    const zeroQuantity = {
      number: "DEMAND-002",
      lines: [{ itemId: dummyUuid1, quantity: "0", requiredDate: "2026-12-01" }],
    };
    expect(productionDemandCreateSchema.safeParse(zeroQuantity).success).toBe(false);
  });

  it("validates mrp run schema and applies default horizonDays", () => {
    const valid = {
      runNumber: "MRP-2026-001",
      asOfDate: "2026-11-09T00:00:00Z",
    };
    const parsed = mrpRunSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.horizonDays).toBe(90);
    }
  });

  it("validates demand list status filter including CANCELLED", () => {
    expect(demandListSchema.safeParse({ status: "DRAFT" }).success).toBe(true);
    expect(demandListSchema.safeParse({ status: "RELEASED" }).success).toBe(true);
    expect(demandListSchema.safeParse({ status: "CANCELLED" }).success).toBe(true);
    expect(demandListSchema.safeParse({ status: "COMPLETED" }).success).toBe(false);
  });
});
