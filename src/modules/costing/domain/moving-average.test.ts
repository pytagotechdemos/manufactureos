import { describe, expect, it } from "vitest";
import { applyValuedIssue, applyValuedReceipt } from "@/modules/costing/domain/moving-average";

describe("moving weighted-average valuation", () => {
  it("calculates weighted average across valued receipts", () => {
    const first = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "10", "5");
    const second = applyValuedReceipt(first.balance, "10", "7");
    expect(second.balance.onHand).toBe("20");
    expect(second.balance.onHandValue).toBe("120");
    expect(second.balance.averageUnitCost).toBe("6");
    expect(second.costStatus).toBe("VALUED");
  });

  it("values issues at the current average and preserves the average", () => {
    const receipt = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "20", "6");
    const issue = applyValuedIssue(receipt.balance, "5");
    expect(issue.movementUnitCost).toBe("6");
    expect(issue.balance.onHand).toBe("15");
    expect(issue.balance.onHandValue).toBe("90");
    expect(issue.balance.averageUnitCost).toBe("6");
  });

  it("retains only the previously valued book value after an unpriced receipt and clears it when stock is exhausted", () => {
    const valued = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "10", "5");
    const mixed = applyValuedReceipt(valued.balance, "10", null);
    expect(mixed.balance.onHand).toBe("20");
    expect(mixed.balance.onHandValue).toBe("50");
    expect(mixed.balance.averageUnitCost).toBe("5");
    expect(mixed.balance.valuationComplete).toBe(false);
    const partialIssue = applyValuedIssue(mixed.balance, "5");
    expect(partialIssue.balance.onHandValue).toBe("50");
    const exhausted = applyValuedIssue(partialIssue.balance, "15");
    expect(exhausted.balance.onHand).toBe("0");
    expect(exhausted.balance.onHandValue).toBe("0");
  });

  it("allows a priced receipt to start a fresh valuation after all unvalued stock is issued", () => {
    const unpriced = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "3", null);
    const cleared = applyValuedIssue(unpriced.balance, "3");
    const priced = applyValuedReceipt(cleared.balance, "2", "7");
    expect(priced.balance.onHand).toBe("2");
    expect(priced.balance.onHandValue).toBe("14");
    expect(priced.balance.averageUnitCost).toBe("7");
    expect(priced.balance.valuationComplete).toBe(true);
    expect(priced.costStatus).toBe("VALUED");
  });

  it("does not reuse an old average after an unpriced receipt followed by a priced receipt", () => {
    const valued = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "10", "5");
    const mixed = applyValuedReceipt(valued.balance, "10", null);
    const laterPriced = applyValuedReceipt(mixed.balance, "10", "7");
    expect(laterPriced.balance.onHandValue).toBe("120");
    expect(laterPriced.balance.averageUnitCost).toBeNull();
    expect(laterPriced.balance.valuationComplete).toBe(false);
    expect(laterPriced.costStatus).toBe("UNVALUED");
  });

  it("does not fabricate valuation after an unvalued receipt", () => {
    const receipt = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "10", null);
    expect(receipt.balance.valuationComplete).toBe(false);
    const issue = applyValuedIssue(receipt.balance, "2");
    expect(issue.costStatus).toBe("UNVALUED");
    expect(issue.balance.onHand).toBe("8");
  });

  it("strictly clears on-hand value to zero when all valued stock is issued, even with fractional rounding", () => {
    // 3 units at total 10.00 -> avg 3.3333
    const receipt = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "3", "3.3333");
    // Partial issue of 1 unit
    const partial = applyValuedIssue(receipt.balance, "1");
    expect(partial.balance.onHand).toBe("2");
    // Final issue of remaining 2 units
    const exhausted = applyValuedIssue(partial.balance, "2");
    expect(exhausted.balance.onHand).toBe("0");
    expect(exhausted.balance.onHandValue).toBe("0");
    expect(exhausted.balance.averageUnitCost).toBeNull();
  });
});
