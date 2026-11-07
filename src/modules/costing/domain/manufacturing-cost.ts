import Decimal from "decimal.js";

export type EstimatedMaterial = { itemId: string; quantity: string };
export type EstimatedOperation = { operationCode: string; standardMinutes: string; hourlyRate: string | null };
export type ActualMaterialIssue = { movementId: string; quantity: string; unitCost: string | null };
export type ActualLaborEntry = { entryId: string; minutes: string; hourlyRate: string | null };

export type ManufacturingCostEstimate = {
  materialCost: string;
  laborCost: string;
  overheadCost: string;
  totalCost: string;
  missingStandardCostItemIds: readonly string[];
  missingStandardOperationCodes: readonly string[];
};

export type ManufacturingActualCost = {
  valuedMaterialCost: string;
  valuedLaborCost: string;
  overheadCost: string;
  knownAccumulatedCost: string;
  wipCost: string;
  completedCost: string;
  costPerAcceptedUnit: string | null;
  unvaluedMovementIds: readonly string[];
  unvaluedLaborEntryIds: readonly string[];
  valuationComplete: boolean;
};

export class CostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostingError";
  }
}

function amount(value: string, label: string, allowZero = true) {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero())) throw new Error();
    return parsed;
  } catch {
    throw new CostingError(`${label} must be a finite ${allowZero ? "non-negative" : "positive"} decimal`);
  }
}

function money(value: Decimal) {
  return value.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString();
}

export function calculateEstimatedManufacturingCost(input: {
  materials: readonly EstimatedMaterial[];
  standardMaterialCosts: ReadonlyMap<string, string | null>;
  operations: readonly EstimatedOperation[];
  plannedOverhead: string;
}): ManufacturingCostEstimate {
  let materialCost = new Decimal(0);
  let laborCost = new Decimal(0);
  const missingStandardCostItemIds = new Set<string>();
  const missingStandardOperationCodes = new Set<string>();

  for (const material of input.materials) {
    const quantity = amount(material.quantity, "Estimated material quantity");
    const unitCost = input.standardMaterialCosts.get(material.itemId);
    if (unitCost === undefined || unitCost === null) {
      missingStandardCostItemIds.add(material.itemId);
      continue;
    }
    materialCost = materialCost.plus(quantity.mul(amount(unitCost, "Standard material cost")));
  }

  for (const operation of input.operations) {
    const minutes = amount(operation.standardMinutes, "Standard operation minutes");
    if (operation.hourlyRate === null) {
      missingStandardOperationCodes.add(operation.operationCode);
      continue;
    }
    const hourlyRate = amount(operation.hourlyRate, "Work center hourly rate");
    laborCost = laborCost.plus(minutes.div(60).mul(hourlyRate));
  }

  const overheadCost = amount(input.plannedOverhead, "Planned overhead");
  return {
    materialCost: money(materialCost),
    laborCost: money(laborCost),
    overheadCost: money(overheadCost),
    totalCost: money(materialCost.plus(laborCost).plus(overheadCost)),
    missingStandardCostItemIds: [...missingStandardCostItemIds].sort(),
    missingStandardOperationCodes: [...missingStandardOperationCodes].sort(),
  };
}

export function calculateActualManufacturingCost(input: {
  materialIssues: readonly ActualMaterialIssue[];
  laborEntries: readonly ActualLaborEntry[];
  overheadCost: string;
  targetQuantity: string;
  producedQuantity: string;
  acceptedQuantity: string;
}): ManufacturingActualCost {
  const target = amount(input.targetQuantity, "Manufacturing target quantity", false);
  const produced = amount(input.producedQuantity, "Produced quantity");
  const accepted = amount(input.acceptedQuantity, "Accepted quantity");
  if (produced.greaterThan(target) || accepted.greaterThan(produced)) throw new CostingError("Manufacturing output quantities are inconsistent");

  let materialCost = new Decimal(0);
  const unvaluedMovementIds: string[] = [];
  for (const issue of input.materialIssues) {
    const quantity = amount(issue.quantity, "Material issue quantity");
    if (issue.unitCost === null) {
      unvaluedMovementIds.push(issue.movementId);
      continue;
    }
    materialCost = materialCost.plus(quantity.mul(amount(issue.unitCost, "Material issue unit cost")));
  }

  let laborCost = new Decimal(0);
  const unvaluedLaborEntryIds: string[] = [];
  for (const entry of input.laborEntries) {
    const minutes = amount(entry.minutes, "Actual labor minutes");
    if (entry.hourlyRate === null) {
      unvaluedLaborEntryIds.push(entry.entryId);
      continue;
    }
    laborCost = laborCost.plus(minutes.div(60).mul(amount(entry.hourlyRate, "Actual labor rate")));
  }

  const overheadCost = amount(input.overheadCost, "Actual overhead");
  const knownAccumulated = materialCost.plus(laborCost).plus(overheadCost);
  const remainingQuantity = target.minus(produced);
  const wipCost = knownAccumulated.mul(remainingQuantity).div(target);
  const completedCost = knownAccumulated.minus(wipCost);
  return {
    valuedMaterialCost: money(materialCost),
    valuedLaborCost: money(laborCost),
    overheadCost: money(overheadCost),
    knownAccumulatedCost: money(knownAccumulated),
    wipCost: money(wipCost),
    completedCost: money(completedCost),
    costPerAcceptedUnit: accepted.isZero() ? null : money(completedCost.div(accepted)),
    unvaluedMovementIds: [...unvaluedMovementIds].sort(),
    unvaluedLaborEntryIds: [...unvaluedLaborEntryIds].sort(),
    valuationComplete: unvaluedMovementIds.length === 0 && unvaluedLaborEntryIds.length === 0,
  };
}
