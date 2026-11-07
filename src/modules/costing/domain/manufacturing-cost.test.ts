import { describe, expect, it } from "vitest";
import { calculateActualManufacturingCost, calculateEstimatedManufacturingCost, CostingError } from "@/modules/costing/domain/manufacturing-cost";

describe("manufacturing costing", () => {
  it("calculates estimated material, labor, and overhead with decimal precision", () => {
    const estimate = calculateEstimatedManufacturingCost({
      materials: [{ itemId: "wood", quantity: "2.5" }, { itemId: "screw", quantity: "8" }],
      standardMaterialCosts: new Map([["wood", "10.25"], ["screw", "0.125"]]),
      operations: [{ operationCode: "ASSEMBLY", standardMinutes: "30", hourlyRate: "24" }],
      plannedOverhead: "3.50",
    });
    expect(estimate.materialCost).toBe("26.625");
    expect(estimate.laborCost).toBe("12");
    expect(estimate.totalCost).toBe("42.125");
    expect(estimate.missingStandardCostItemIds).toEqual([]);
  });

  it("reports missing standard cost instead of pretending the estimate is complete", () => {
    const estimate = calculateEstimatedManufacturingCost({
      materials: [{ itemId: "unknown", quantity: "2" }],
      standardMaterialCosts: new Map(),
      operations: [],
      plannedOverhead: "0",
    });
    expect(estimate.missingStandardCostItemIds).toEqual(["unknown"]);
    expect(estimate.totalCost).toBe("0");
  });

  it("keeps cost attributable to outstanding production in WIP", () => {
    const actual = calculateActualManufacturingCost({
      materialIssues: [{ movementId: "m1", quantity: "10", unitCost: "5" }],
      laborEntries: [{ entryId: "t1", minutes: "60", hourlyRate: "30" }],
      overheadCost: "20",
      targetQuantity: "10",
      producedQuantity: "4",
      acceptedQuantity: "3",
    });
    expect(actual.knownAccumulatedCost).toBe("100");
    expect(actual.wipCost).toBe("60");
    expect(actual.completedCost).toBe("40");
    expect(actual.costPerAcceptedUnit).toBe("13.3333");
  });

  it("marks actual valuation incomplete when posted inputs lack cost", () => {
    const actual = calculateActualManufacturingCost({
      materialIssues: [{ movementId: "unvalued-issue", quantity: "2", unitCost: null }],
      laborEntries: [{ entryId: "unvalued-time", minutes: "30", hourlyRate: null }],
      overheadCost: "0",
      targetQuantity: "2",
      producedQuantity: "0",
      acceptedQuantity: "0",
    });
    expect(actual.valuationComplete).toBe(false);
    expect(actual.unvaluedMovementIds).toEqual(["unvalued-issue"]);
    expect(actual.unvaluedLaborEntryIds).toEqual(["unvalued-time"]);
    expect(actual.costPerAcceptedUnit).toBeNull();
  });

  it("rejects inconsistent production quantity totals", () => {
    expect(() => calculateActualManufacturingCost({ materialIssues: [], laborEntries: [], overheadCost: "0", targetQuantity: "2", producedQuantity: "3", acceptedQuantity: "1" })).toThrowError(CostingError);
  });
});
