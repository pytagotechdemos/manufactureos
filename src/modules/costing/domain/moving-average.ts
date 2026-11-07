import Decimal from "decimal.js";

export type ValuationBalance = {
  onHand: string;
  onHandValue: string;
  averageUnitCost: string | null;
  valuationComplete: boolean;
};

export type ValuationResult = {
  balance: ValuationBalance;
  movementUnitCost: string | null;
  costStatus: "VALUED" | "UNVALUED";
};

function decimal(value: string, label: string) {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative()) throw new Error(`${label} must be a finite non-negative decimal`);
  return parsed;
}

function rounded(value: Decimal) {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export function applyValuedReceipt(balance: ValuationBalance, quantityValue: string, unitCostValue: string | null): ValuationResult {
  const quantity = decimal(quantityValue, "Receipt quantity");
  const onHand = decimal(balance.onHand, "On hand");
  const value = decimal(balance.onHandValue, "On-hand value");
  if (quantity.isZero()) throw new Error("Receipt quantity must be positive");
  if (unitCostValue === null) {
    return {
      balance: { onHand: onHand.plus(quantity).toString(), onHandValue: value.toString(), averageUnitCost: null, valuationComplete: false },
      movementUnitCost: null,
      costStatus: "UNVALUED",
    };
  }
  const unitCost = decimal(unitCostValue, "Receipt unit cost");
  const newOnHand = onHand.plus(quantity);
  const newValue = rounded(value.plus(quantity.mul(unitCost)));
  const complete = balance.valuationComplete;
  return {
    balance: {
      onHand: newOnHand.toString(),
      onHandValue: newValue.toString(),
      averageUnitCost: complete && newOnHand.greaterThan(0) ? rounded(newValue.div(newOnHand)).toString() : null,
      valuationComplete: complete,
    },
    movementUnitCost: rounded(unitCost).toString(),
    costStatus: complete ? "VALUED" : "UNVALUED",
  };
}

export function applyValuedIssue(balance: ValuationBalance, quantityValue: string): ValuationResult {
  const quantity = decimal(quantityValue, "Issue quantity");
  const onHand = decimal(balance.onHand, "On hand");
  if (quantity.isZero() || quantity.greaterThan(onHand)) throw new Error("Issue quantity must be positive and not exceed on hand");
  if (!balance.valuationComplete || balance.averageUnitCost === null) {
    return {
      balance: { ...balance, onHand: onHand.minus(quantity).toString(), valuationComplete: false, averageUnitCost: null },
      movementUnitCost: null,
      costStatus: "UNVALUED",
    };
  }
  const average = decimal(balance.averageUnitCost, "Average unit cost");
  const currentValue = decimal(balance.onHandValue, "On-hand value");
  const issueValue = rounded(quantity.mul(average));
  const remaining = onHand.minus(quantity);
  const value = Decimal.max(new Decimal(0), currentValue.minus(issueValue));
  return {
    balance: { onHand: remaining.toString(), onHandValue: rounded(value).toString(), averageUnitCost: remaining.isZero() ? null : average.toString(), valuationComplete: true },
    movementUnitCost: average.toString(),
    costStatus: "VALUED",
  };
}
