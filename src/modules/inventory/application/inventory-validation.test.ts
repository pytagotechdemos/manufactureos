import { describe, expect, it } from "vitest";
import {
  adjustmentSchema,
  blockSchema,
  issueInputSchema,
  receiptInputSchema,
  transferSchema,
} from "./inventory-service";

describe("inventory input validation", () => {
  const validBase = {
    itemId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    warehouseId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    quantity: "25.500000",
    sourceType: "MANUAL",
    sourceId: "manual-ref-001",
    idempotencyKey: "test-idem-key-12345",
  };

  it("accepts valid receipt with optional unitCost", () => {
    const valid = receiptInputSchema.parse({
      ...validBase,
      unitCost: "50000.0000",
    });
    expect(valid.quantity).toBe("25.500000");
    expect(valid.unitCost).toBe("50000.0000");
  });

  it("rejects inventory issues with client-provided unitCost", () => {
    const result = issueInputSchema.safeParse({
      ...validBase,
      unitCost: "1000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid inventory issue without unitCost", () => {
    const valid = issueInputSchema.parse(validBase);
    expect(valid.quantity).toBe("25.500000");
  });

  it("rejects transfer when source and destination warehouse are identical", () => {
    const result = transferSchema.safeParse({
      itemId: validBase.itemId,
      fromWarehouseId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      toWarehouseId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      quantity: "10.000000",
      sourceType: validBase.sourceType,
      sourceId: validBase.sourceId,
      idempotencyKey: validBase.idempotencyKey,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid transfer between distinct warehouses", () => {
    const valid = transferSchema.parse({
      itemId: validBase.itemId,
      fromWarehouseId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      toWarehouseId: "2c0e7cde-ccfe-4c3e-ac6e-bc9efcce5cfe",
      quantity: "10.000000",
      sourceType: validBase.sourceType,
      sourceId: validBase.sourceId,
      idempotencyKey: validBase.idempotencyKey,
    });
    expect(valid.fromWarehouseId).not.toBe(valid.toWarehouseId);
  });

  it("rejects decrease adjustment with unitCost", () => {
    const result = adjustmentSchema.safeParse({
      ...validBase,
      direction: "DECREASE",
      unitCost: "25000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts increase adjustment with unitCost", () => {
    const valid = adjustmentSchema.parse({
      ...validBase,
      direction: "INCREASE",
      unitCost: "25000",
    });
    expect(valid.direction).toBe("INCREASE");
    expect(valid.unitCost).toBe("25000");
  });

  it("validates block and unblock stock actions", () => {
    const block = blockSchema.parse({ ...validBase, action: "BLOCK" });
    const unblock = blockSchema.parse({ ...validBase, action: "UNBLOCK" });
    expect(block.action).toBe("BLOCK");
    expect(unblock.action).toBe("UNBLOCK");
    expect(blockSchema.safeParse({ ...validBase, action: "INVALID" }).success).toBe(false);
  });
});
