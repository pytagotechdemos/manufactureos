import { describe, expect, it } from "vitest";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  itemCreateSchema,
  itemListSchema,
  itemUpdateSchema,
} from "@/modules/master-data/application/item-validation";

const baseItem = {
  sku: "RM-WOOD-001",
  name: "Oak Board",
  categoryId: "6ed293bc-64d3-4472-9bf6-092d09e2d36c",
  itemType: "RAW_MATERIAL",
  supplyType: "BUY",
  baseUomId: "0ca08576-bd06-47ab-880f-4579b247d2ec",
};

describe("item validation", () => {
  it("applies exact decimal defaults", () => {
    const result = itemCreateSchema.parse(baseItem);
    expect(result.reorderPoint).toBe("0");
    expect(result.safetyStock).toBe("0");
    expect(result.purchasingLeadDays).toBe(0);
  });

  it("rejects negative planning amounts", () => {
    expect(itemCreateSchema.safeParse({ ...baseItem, safetyStock: "-2" }).success).toBe(false);
    expect(itemCreateSchema.safeParse({ ...baseItem, standardMaterialCost: "-0.01" }).success).toBe(false);
  });

  it("bounds list pagination and accepts searches", () => {
    expect(itemListSchema.parse({ search: "oak", limit: "25", offset: "50" })).toMatchObject({ search: "oak", limit: 25, offset: 50 });
    expect(itemListSchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("validates partial item updates correctly", () => {
    const validUpdate = itemUpdateSchema.parse({
      name: "Updated Oak Board",
      standardMaterialCost: "150000.50",
      safetyStock: "50",
      purchasingLeadDays: 7,
      status: "ACTIVE",
    });
    expect(validUpdate.name).toBe("Updated Oak Board");
    expect(validUpdate.standardMaterialCost).toBe("150000.50");

    expect(itemUpdateSchema.safeParse({ safetyStock: "-5" }).success).toBe(false);
    expect(itemUpdateSchema.safeParse({ purchasingLeadDays: -1 }).success).toBe(false);
    expect(itemUpdateSchema.safeParse({ standardMaterialCost: "invalid" }).success).toBe(false);
  });
});

describe("category validation", () => {
  it("validates and normalizes category creation", () => {
    const valid = categoryCreateSchema.parse({
      code: "pkg",
      name: "Packaging Materials",
    });
    expect(valid.code).toBe("PKG");
    expect(valid.name).toBe("Packaging Materials");
  });

  it("rejects empty or excessively long category attributes", () => {
    expect(categoryCreateSchema.safeParse({ code: "", name: "Test" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ code: "VALID", name: "" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ code: "A".repeat(25), name: "Test" }).success).toBe(false);
  });

  it("validates category status updates", () => {
    const update = categoryUpdateSchema.parse({ status: "INACTIVE" });
    expect(update.status).toBe("INACTIVE");
    expect(categoryUpdateSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });
});
