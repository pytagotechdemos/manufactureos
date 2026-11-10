import { describe, expect, it } from "vitest";
import { calculateMrp, type MrpInput } from "@/modules/planning/domain/mrp-engine";

const buy = (itemId: string, overrides: Partial<MrpInput["items"][number]> = {}) => ({ itemId, supplyType: "BUY" as const, safetyStock: "0", leadTimeDays: 2, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true, ...overrides });

const baseInput: MrpInput = {
  asOfDate: "2026-01-01",
  items: [buy("wood")],
  boms: [],
  demands: [{ demandId: "d1", itemId: "wood", quantity: "10", requiredDate: "2026-01-10" }],
  availableStock: new Map([["wood", "3"]]),
  confirmedSupply: [],
};

describe("calculateMrp", () => {
  it("nets available stock and creates a dated BUY recommendation", () => {
    const result = calculateMrp(baseInput);
    expect(result.recommendations).toEqual([{
      itemId: "wood",
      supplyType: "BUY",
      quantity: "7",
      requiredDate: "2026-01-10",
      plannedReleaseDate: "2026-01-08",
      late: false,
      sourceDemandIds: ["d1"],
    }]);
  });

  it("does not use supply that arrives after the demand date", () => {
    const result = calculateMrp({
      ...baseInput,
      availableStock: new Map([["wood", "0"]]),
      confirmedSupply: [{ supplyId: "po1", itemId: "wood", quantity: "10", availableDate: "2026-01-11", supplyType: "PURCHASE_ORDER" }],
    });
    expect(result.recommendations[0]?.late).toBe(false);
    expect(result.recommendations[0]?.quantity).toBe("10");
  });

  it("marks planned releases late when the as-of date has passed the release date", () => {
    const result = calculateMrp({ ...baseInput, asOfDate: "2026-01-09" });
    expect(result.recommendations[0]?.late).toBe(true);
  });

  it("includes safety stock, minimum order, and lot multiple", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [buy("wood", { safetyStock: "2", minimumOrderQty: "5", lotSizeMultiple: "4" })],
      availableStock: new Map([["wood", "0"]]),
      demands: [{ demandId: "d1", itemId: "wood", quantity: "3", requiredDate: "2026-01-10" }],
    });
    expect(result.recommendations[0]?.quantity).toBe("8");
  });

  it("propagates nested MAKE demand into BUY child requirements", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [
        { itemId: "desk", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 3, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true },
        buy("board"),
      ],
      boms: [{ outputItemId: "desk", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "board", quantityPerOutput: "2", scrapRate: "0.1" }] }],
      demands: [{ demandId: "d1", itemId: "desk", quantity: "5", requiredDate: "2026-01-10" }],
      availableStock: new Map([["desk", "2"], ["board", "0"]]),
    });
    expect(result.recommendations.map((recommendation) => [recommendation.itemId, recommendation.quantity])).toEqual([["board", "7"], ["desk", "3"]]);
    expect(result.recommendations.find((recommendation) => recommendation.itemId === "board")?.requiredDate).toBe("2026-01-07");
  });

  it("consumes MAKE on-hand stock across dated requirements before exploding components", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "assembly", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true }, buy("component")],
      boms: [{ outputItemId: "assembly", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "component", quantityPerOutput: "1", scrapRate: "0" }] }],
      demands: [
        { demandId: "d1", itemId: "assembly", quantity: "3", requiredDate: "2026-01-10" },
        { demandId: "d2", itemId: "assembly", quantity: "3", requiredDate: "2026-01-11" },
      ],
      availableStock: new Map([["assembly", "5"], ["component", "0"]]),
    });
    expect(result.recommendations.find((row) => row.itemId === "assembly")?.quantity).toBe("1");
    expect(result.recommendations.find((row) => row.itemId === "component")?.quantity).toBe("1");
    expect(result.buckets.filter((row) => row.itemId === "assembly").map((row) => row.projectedAvailable)).toEqual(["2", "0"]);
  });

  it("does not explode components for MAKE stock already available", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "desk", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true }, buy("board")],
      boms: [],
      demands: [{ demandId: "d1", itemId: "desk", quantity: "2", requiredDate: "2026-01-10" }],
      availableStock: new Map([["desk", "2"], ["board", "0"]]),
    });
    expect(result.recommendations).toEqual([]);
  });

  it("explodes child requirements for the rounded MAKE lot quantity", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [
        { itemId: "desk", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 2, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true },
        buy("board"),
      ],
      boms: [{ outputItemId: "desk", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "board", quantityPerOutput: "2", scrapRate: "0" }] }],
      demands: [{ demandId: "d1", itemId: "desk", quantity: "1.2", requiredDate: "2026-01-10" }],
      availableStock: new Map([["desk", "0"], ["board", "0"]]),
    });
    expect(result.recommendations.find((row) => row.itemId === "desk")?.quantity).toBe("2");
    expect(result.recommendations.find((row) => row.itemId === "board")?.quantity).toBe("4");
  });

  it("explodes combined MAKE demand once after applying the lot multiple", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "assembly", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "10", discrete: true }, buy("component")],
      boms: [{ outputItemId: "assembly", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "component", quantityPerOutput: "1", scrapRate: "0" }] }],
      demands: [
        { demandId: "d1", itemId: "assembly", quantity: "1", requiredDate: "2026-01-10" },
        { demandId: "d2", itemId: "assembly", quantity: "1", requiredDate: "2026-01-10" },
      ],
      availableStock: new Map([["assembly", "0"], ["component", "0"]]),
    });
    expect(result.recommendations.find((row) => row.itemId === "assembly")?.quantity).toBe("10");
    expect(result.recommendations.find((row) => row.itemId === "component")?.quantity).toBe("10");
  });

  it("carries MAKE lot surplus forward to later demand dates", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "assembly", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "10", discrete: true }, buy("component")],
      boms: [{ outputItemId: "assembly", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "component", quantityPerOutput: "1", scrapRate: "0" }] }],
      demands: [
        { demandId: "d1", itemId: "assembly", quantity: "1", requiredDate: "2026-01-10" },
        { demandId: "d2", itemId: "assembly", quantity: "1", requiredDate: "2026-01-11" },
      ],
      availableStock: new Map([["assembly", "0"], ["component", "0"]]),
    });
    expect(result.recommendations.filter((row) => row.itemId === "assembly")).toHaveLength(1);
    expect(result.recommendations.find((row) => row.itemId === "component")?.quantity).toBe("10");
  });

  it("explodes MAKE safety-stock replenishment into component demand", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "assembly", supplyType: "MAKE", safetyStock: "5", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true }, buy("component")],
      boms: [{ outputItemId: "assembly", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "component", quantityPerOutput: "1", scrapRate: "0" }] }],
      demands: [{ demandId: "d1", itemId: "assembly", quantity: "1", requiredDate: "2026-01-10" }],
      availableStock: new Map([["assembly", "0"], ["component", "0"]]),
    });
    expect(result.recommendations.find((row) => row.itemId === "assembly")?.quantity).toBe("6");
    expect(result.recommendations.find((row) => row.itemId === "component")?.quantity).toBe("6");
  });

  it("covers MAKE safety stock from on-hand stock and only explodes the shortage", () => {
    const result = calculateMrp({
      ...baseInput,
      items: [{ itemId: "assembly", supplyType: "MAKE", safetyStock: "5", leadTimeDays: 0, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true }, buy("component")],
      boms: [{ outputItemId: "assembly", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "component", quantityPerOutput: "1", scrapRate: "0" }] }],
      demands: [{ demandId: "d1", itemId: "assembly", quantity: "1", requiredDate: "2026-01-10" }],
      availableStock: new Map([["assembly", "3"], ["component", "0"]]),
    });
    expect(result.recommendations.find((row) => row.itemId === "assembly")?.quantity).toBe("3");
    expect(result.recommendations.find((row) => row.itemId === "component")?.quantity).toBe("3");
  });

  it("nets dated MAKE manufacturing supply against requirements", () => {
    const result = calculateMrp({
      ...baseInput,
      demands: [{ demandId: "d1", itemId: "desk", quantity: "5", requiredDate: "2026-01-10" }],
      items: [{ itemId: "desk", supplyType: "MAKE", safetyStock: "0", leadTimeDays: 2, minimumOrderQty: "0", lotSizeMultiple: "0", discrete: true }, buy("wood")],
      boms: [{ outputItemId: "desk", outputQuantity: "1", effectiveDate: "2026-01-01", lines: [{ componentItemId: "wood", quantityPerOutput: "1", scrapRate: "0" }] }],
      availableStock: new Map([ ["desk", "0"], ["wood", "0"] ]),
      confirmedSupply: [{ supplyId: "mo1", itemId: "desk", quantity: "3", availableDate: "2026-01-10", supplyType: "MANUFACTURING_ORDER" }],
    });
    expect(result.recommendations.find((row) => row.itemId === "desk")?.quantity).toBe("2");
    expect(result.recommendations.find((row) => row.itemId === "wood")?.quantity).toBe("2");
  });

  it("nets confirmed supply already overdue as of the planning date", () => {
    const result = calculateMrp({
      ...baseInput,
      asOfDate: "2026-01-09",
      availableStock: new Map([["wood", "0"]]),
      confirmedSupply: [{ supplyId: "po-overdue", itemId: "wood", quantity: "10", availableDate: "2026-01-05", supplyType: "PURCHASE_ORDER" }],
    });
    expect(result.recommendations).toEqual([]);
    expect(result.buckets.find((bucket) => bucket.date === "2026-01-05")?.projectedAvailable).toBe("10");
    expect(result.buckets.find((bucket) => bucket.date === "2026-01-10")?.projectedAvailable).toBe("0");
  });

  it("nets supply available on the requirement date", () => {
    const result = calculateMrp({
      ...baseInput,
      availableStock: new Map([["wood", "0"]]),
      confirmedSupply: [{ supplyId: "po1", itemId: "wood", quantity: "10", availableDate: "2026-01-10", supplyType: "PURCHASE_ORDER" }],
    });
    expect(result.recommendations).toEqual([]);
    expect(result.buckets.find((bucket) => bucket.date === "2026-01-10")?.projectedAvailable).toBe("0");
  });

  it("produces buckets for items with confirmed scheduled supply even without direct demand", () => {
    const result = calculateMrp({
      asOfDate: "2026-01-01",
      items: [buy("metal")],
      boms: [],
      demands: [],
      availableStock: new Map([["metal", "5"]]),
      confirmedSupply: [{ supplyId: "po-metal", itemId: "metal", quantity: "15", availableDate: "2026-01-12", supplyType: "PURCHASE_ORDER" }],
    });
    expect(result.recommendations).toEqual([]);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]?.itemId).toBe("metal");
    expect(result.buckets[0]?.date).toBe("2026-01-12");
    expect(result.buckets[0]?.scheduledReceipts).toBe("15");
    expect(result.buckets[0]?.projectedAvailable).toBe("20");
  });

  it("is deterministic for identical snapshots", () => {
    const first = calculateMrp(baseInput);
    const second = calculateMrp(baseInput);
    expect(second).toEqual(first);
  });
});
