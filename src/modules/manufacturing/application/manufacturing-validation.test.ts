import { describe, expect, it } from "vitest";
import { manufacturingOrderCreateSchema, manufacturingOrderListSchema, materialDispositionSchema, materialIssueSchema } from "./manufacturing-validation";
import { workOutputSchema } from "./work-order-service";

describe("Manufacturing validation schemas", () => {
  const dummyUuid1 = "12345678-1234-4234-8234-123456789012";
  const dummyUuid2 = "22345678-1234-4234-8234-123456789012";
  const dummyUuid3 = "32345678-1234-4234-8234-123456789012";

  it("validates manufacturing order create input", () => {
    const valid = {
      number: "MO-2026-001",
      recommendationId: dummyUuid1,
      warehouseId: dummyUuid2,
      wipWarehouseId: dummyUuid3,
    };
    expect(manufacturingOrderCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("validates material issue schema and rejects non-positive quantity", () => {
    expect(materialIssueSchema.safeParse({ quantity: "15.25", idempotencyKey: "issue-key-12345" }).success).toBe(true);
    expect(materialIssueSchema.safeParse({ quantity: "0", idempotencyKey: "issue-key-12345" }).success).toBe(false);
    expect(materialIssueSchema.safeParse({ quantity: "-5", idempotencyKey: "issue-key-12345" }).success).toBe(false);
  });

  it("validates work output schema with completedQty and default rejectedQty", () => {
    const parsed = workOutputSchema.safeParse({ completedQty: "10" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.rejectedQty).toBe("0");
    }

    const invalid = workOutputSchema.safeParse({ completedQty: "0", rejectedQty: "-1" });
    expect(invalid.success).toBe(false);
  });

  it("validates manufacturing order list status filters including CANCELLED and ON_HOLD", () => {
    const validStatuses = ["DRAFT", "PLANNED", "RELEASED", "IN_PROGRESS", "QC_PENDING", "COMPLETED", "ON_HOLD", "CANCELLED"];
    for (const status of validStatuses) {
      expect(manufacturingOrderListSchema.safeParse({ status }).success).toBe(true);
    }
    expect(manufacturingOrderListSchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
  });

  it("validates material disposition schema requires min 8 char idempotencyKey", () => {
    expect(materialDispositionSchema.safeParse({ quantity: "5", idempotencyKey: "12345678" }).success).toBe(true);
    expect(materialDispositionSchema.safeParse({ quantity: "5", idempotencyKey: "short" }).success).toBe(false);
  });
});
