import { describe, expect, it } from "vitest";
import { itemCreateSchema, itemListSchema } from "@/modules/master-data/application/item-validation";

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
});
