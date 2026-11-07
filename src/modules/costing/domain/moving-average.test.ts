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

  it("does not fabricate valuation after an unvalued receipt", () => {
    const receipt = applyValuedReceipt({ onHand: "0", onHandValue: "0", averageUnitCost: null, valuationComplete: true }, "10", null);
    expect(receipt.balance.valuationComplete).toBe(false);
    const issue = applyValuedIssue(receipt.balance, "2");
    expect(issue.costStatus).toBe("UNVALUED");
    expect(issue.balance.onHand).toBe("8");
  });
});
