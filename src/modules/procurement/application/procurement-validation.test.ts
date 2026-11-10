import { describe, expect, it } from "vitest";
import {
  goodsReceiptCreateSchema,
  purchaseOrderCreateSchema,
  purchaseOrderListSchema,
  purchaseRequestCreateSchema,
  purchaseRequestListSchema,
} from "./procurement-validation";

describe("Procurement validation schemas", () => {
  const dummyUuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const dummyUuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
  const dummyUuid3 = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";

  it("validates valid purchase request input", () => {
    const valid = {
      number: "PR-2026-001",
      supplierId: dummyUuid1,
      lines: [
        {
          itemId: dummyUuid2,
          quantity: "10.5",
          uomId: dummyUuid3,
          notes: "Urgent replenishment",
        },
      ],
    };
    expect(purchaseRequestCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects non-positive purchase request quantity", () => {
    const invalid = {
      number: "PR-2026-002",
      lines: [{ itemId: dummyUuid2, quantity: "0", uomId: dummyUuid3 }],
    };
    expect(purchaseRequestCreateSchema.safeParse(invalid).success).toBe(false);
  });

  it("enforces coupled requestLineId and requestQuantity on PO lines", () => {
    const validWithAlloc = {
      number: "PO-2026-001",
      supplierId: dummyUuid1,
      warehouseId: dummyUuid2,
      lines: [
        {
          itemId: dummyUuid3,
          quantity: "50",
          unitCost: "15000",
          uomId: dummyUuid1,
          requestLineId: dummyUuid2,
          requestQuantity: "50",
        },
      ],
    };
    expect(purchaseOrderCreateSchema.safeParse(validWithAlloc).success).toBe(true);

    const missingQuantity = {
      ...validWithAlloc,
      lines: [{ ...validWithAlloc.lines[0], requestQuantity: undefined }],
    };
    expect(purchaseOrderCreateSchema.safeParse(missingQuantity).success).toBe(false);

    const missingRequestLineId = {
      ...validWithAlloc,
      lines: [{ ...validWithAlloc.lines[0], requestLineId: undefined }],
    };
    expect(purchaseOrderCreateSchema.safeParse(missingRequestLineId).success).toBe(false);
  });

  it("rejects duplicate purchase order line IDs in goods receipt", () => {
    const duplicateLines = {
      number: "GR-2026-001",
      purchaseOrderId: dummyUuid1,
      warehouseId: dummyUuid2,
      idempotencyKey: "gr-key-12345678",
      lines: [
        { purchaseOrderLineId: dummyUuid3, quantity: "10" },
        { purchaseOrderLineId: dummyUuid3, quantity: "20" },
      ],
    };
    expect(goodsReceiptCreateSchema.safeParse(duplicateLines).success).toBe(false);

    const distinctLines = {
      ...duplicateLines,
      lines: [
        { purchaseOrderLineId: dummyUuid1, quantity: "10" },
        { purchaseOrderLineId: dummyUuid2, quantity: "20" },
      ],
    };
    expect(goodsReceiptCreateSchema.safeParse(distinctLines).success).toBe(true);
  });

  it("validates purchase order list status filters including CLOSED and CANCELLED", () => {
    const validStatuses = ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED", "CLOSED"];
    for (const status of validStatuses) {
      expect(purchaseOrderListSchema.safeParse({ status }).success).toBe(true);
    }
    expect(purchaseOrderListSchema.safeParse({ status: "NONEXISTENT" }).success).toBe(false);
  });

  it("validates purchase request list status filters including CANCELLED", () => {
    const validStatuses = ["DRAFT", "APPROVED", "CANCELLED"];
    for (const status of validStatuses) {
      expect(purchaseRequestListSchema.safeParse({ status }).success).toBe(true);
    }
    expect(purchaseRequestListSchema.safeParse({ status: "CLOSED" }).success).toBe(false);
  });
});
