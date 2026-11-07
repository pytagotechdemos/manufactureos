import Decimal from "decimal.js";

export type MrpItem = {
  itemId: string;
  supplyType: "MAKE" | "BUY";
  safetyStock: string;
  leadTimeDays: number;
  minimumOrderQty: string;
  lotSizeMultiple: string;
  discrete: boolean;
};

export type MrpBomLine = {
  componentItemId: string;
  quantityPerOutput: string;
  scrapRate: string;
};

export type MrpBom = {
  outputItemId: string;
  outputQuantity: string;
  effectiveDate: string;
  lines: readonly MrpBomLine[];
};

export type MrpDemand = {
  demandId: string;
  itemId: string;
  quantity: string;
  requiredDate: string;
};

export type MrpDatedSupply = {
  supplyId: string;
  itemId: string;
  quantity: string;
  availableDate: string;
  supplyType: "PURCHASE_ORDER" | "MANUFACTURING_ORDER";
};

export type MrpInput = {
  asOfDate: string;
  items: readonly MrpItem[];
  boms: readonly MrpBom[];
  demands: readonly MrpDemand[];
  availableStock: ReadonlyMap<string, string>;
  confirmedSupply: readonly MrpDatedSupply[];
};

export type MrpRecommendation = {
  itemId: string;
  supplyType: "BUY" | "MAKE";
  quantity: string;
  requiredDate: string;
  plannedReleaseDate: string;
  late: boolean;
  sourceDemandIds: readonly string[];
};

export type MrpBucket = {
  itemId: string;
  date: string;
  grossRequirements: string;
  scheduledReceipts: string;
  projectedAvailable: string;
  netRequirements: string;
  recommendations: readonly MrpRecommendation[];
};

export type MrpResult = {
  buckets: readonly MrpBucket[];
  recommendations: readonly MrpRecommendation[];
};

export class MrpError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "MISSING_ITEM" | "MISSING_BOM" | "AMBIGUOUS_BOM" | "BOM_CYCLE", message: string) {
    super(message);
    this.name = "MrpError";
  }
}

function decimal(value: string, label: string, allowZero = true) {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero())) throw new Error();
    return parsed;
  } catch {
    throw new MrpError("INVALID_INPUT", `${label} must be a finite ${allowZero ? "non-negative" : "positive"} decimal`);
  }
}

function date(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MrpError("INVALID_INPUT", `${label} must be a valid date`);
  return parsed;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function roundLot(quantity: Decimal, item: MrpItem) {
  let result = quantity;
  const minimum = decimal(item.minimumOrderQty, "Minimum order quantity");
  if (result.lessThan(minimum)) result = minimum;
  const multiple = decimal(item.lotSizeMultiple, "Lot size multiple");
  if (multiple.greaterThan(0)) result = result.div(multiple).ceil().mul(multiple);
  if (item.discrete) result = result.ceil();
  return result;
}

function effectiveBomFor(itemId: string, requiredDate: Date, boms: readonly MrpBom[]) {
  const candidates = boms
    .filter((bom) => bom.outputItemId === itemId && date(bom.effectiveDate, "BOM effective date") <= requiredDate)
    .sort((left, right) => date(right.effectiveDate, "BOM effective date").getTime() - date(left.effectiveDate, "BOM effective date").getTime());
  if (candidates.length > 1 && date(candidates[0]!.effectiveDate, "BOM effective date").getTime() === date(candidates[1]!.effectiveDate, "BOM effective date").getTime()) {
    throw new MrpError("AMBIGUOUS_BOM", `Multiple effective BOMs exist for item ${itemId}`);
  }
  return candidates[0];
}

type GrossNeed = { itemId: string; quantity: Decimal; date: Date; demandIds: Set<string> };

function explodeMakeNeed(
  itemId: string,
  quantity: Decimal,
  requiredDate: Date,
  sourceDemandIds: Set<string>,
  input: MrpInput,
  path: readonly string[],
  makeNeeds: GrossNeed[],
  buyNeeds: GrossNeed[],
  remainingMakeStock: Map<string, Decimal>,
) {
  if (path.includes(itemId)) throw new MrpError("BOM_CYCLE", `MRP BOM cycle detected: ${[...path, itemId].join(" -> ")}`);
  const item = input.items.find((candidate) => candidate.itemId === itemId);
  if (!item) throw new MrpError("MISSING_ITEM", `MRP item ${itemId} is missing`);
  if (item.supplyType === "BUY") {
    buyNeeds.push({ itemId, quantity, date: requiredDate, demandIds: new Set(sourceDemandIds) });
    return;
  }

  makeNeeds.push({ itemId, quantity, date: requiredDate, demandIds: new Set(sourceDemandIds) });
  const available = remainingMakeStock.get(itemId) ?? new Decimal(0);
  const covered = Decimal.min(available, quantity);
  remainingMakeStock.set(itemId, available.minus(covered));
  const buildQuantity = quantity.minus(covered);
  if (buildQuantity.isZero()) return;

  const bom = effectiveBomFor(itemId, requiredDate, input.boms);
  if (!bom) throw new MrpError("MISSING_BOM", `No effective approved BOM exists for MAKE item ${itemId} on ${dateKey(requiredDate)}`);
  const outputQty = decimal(bom.outputQuantity, "BOM output quantity", false);
  const buildFactor = buildQuantity.div(outputQty);
  const componentRequiredDate = addDays(requiredDate, -item.leadTimeDays);

  for (const line of bom.lines) {
    const componentQty = decimal(line.quantityPerOutput, "BOM component quantity", false);
    const scrapRate = decimal(line.scrapRate, "BOM scrap rate");
    const extended = componentQty.mul(buildFactor).mul(new Decimal(1).plus(scrapRate));
    explodeMakeNeed(line.componentItemId, extended, componentRequiredDate, sourceDemandIds, input, [...path, itemId], makeNeeds, buyNeeds, remainingMakeStock);
  }
}

export function calculateMrp(input: MrpInput): MrpResult {
  const asOfDate = date(input.asOfDate, "MRP as-of date");
  const items = new Map(input.items.map((item) => [item.itemId, item]));
  const needs: GrossNeed[] = [];
  const plannedMake: GrossNeed[] = [];
  const remainingMakeStock = new Map([...input.availableStock.entries()].map(([itemId, quantity]) => [itemId, decimal(quantity, "Available stock")]));

  const demands = [...input.demands].sort((left, right) => left.requiredDate.localeCompare(right.requiredDate) || left.itemId.localeCompare(right.itemId) || left.demandId.localeCompare(right.demandId));
  for (const demand of demands) {
    const requiredDate = date(demand.requiredDate, "Demand required date");
    const quantity = decimal(demand.quantity, "Demand quantity", false);
    const item = items.get(demand.itemId);
    if (!item) throw new MrpError("MISSING_ITEM", `MRP item ${demand.itemId} is missing`);
    if (item.supplyType === "BUY") {
      needs.push({ itemId: item.itemId, quantity, date: requiredDate, demandIds: new Set([demand.demandId]) });
    } else {
      explodeMakeNeed(item.itemId, quantity, requiredDate, new Set([demand.demandId]), input, [], plannedMake, needs, remainingMakeStock);
    }
  }

  for (const makeNeed of plannedMake) {
    needs.push(makeNeed);
  }

  const byItem = new Map<string, GrossNeed[]>();
  for (const need of needs) byItem.set(need.itemId, [...(byItem.get(need.itemId) ?? []), need]);
  const recommendations: MrpRecommendation[] = [];
  const buckets: MrpBucket[] = [];

  for (const [itemId, itemNeeds] of [...byItem.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const item = items.get(itemId);
    if (!item) throw new MrpError("MISSING_ITEM", `MRP item ${itemId} is missing`);
    const supply = input.confirmedSupply
      .filter((receipt) => receipt.itemId === itemId)
      .map((receipt) => ({ date: date(receipt.availableDate, "Supply available date"), quantity: decimal(receipt.quantity, "Supply quantity", false) }))
      .sort((left, right) => left.date.getTime() - right.date.getTime());
    const stock = decimal(input.availableStock.get(itemId) ?? "0", "Available stock");
    let projected = stock;
    const safety = decimal(item.safetyStock, "Safety stock");
    const dates = [...new Set([...itemNeeds.map((need) => dateKey(need.date)), ...supply.map((receipt) => dateKey(receipt.date))])].sort();
    let remainingSupply = [...supply];

    for (const key of dates) {
      const bucketDate = date(key, "MRP bucket date");
      const scheduled = remainingSupply.filter((receipt) => dateKey(receipt.date) === key).reduce((sum, receipt) => sum.plus(receipt.quantity), new Decimal(0));
      remainingSupply = remainingSupply.filter((receipt) => dateKey(receipt.date) !== key);
      const datedNeeds = itemNeeds.filter((need) => dateKey(need.date) === key);
      const gross = datedNeeds.reduce((sum, need) => sum.plus(need.quantity), new Decimal(0));
      projected = projected.plus(scheduled).minus(gross);
      const net = projected.lessThan(safety) ? safety.minus(projected) : new Decimal(0);
      const bucketRecommendations: MrpRecommendation[] = [];
      if (net.greaterThan(0)) {
        const plannedQty = roundLot(net, item);
        const releaseDate = addDays(bucketDate, -item.leadTimeDays);
        const recommendation: MrpRecommendation = {
          itemId,
          supplyType: item.supplyType,
          quantity: plannedQty.toString(),
          requiredDate: key,
          plannedReleaseDate: dateKey(releaseDate),
          late: releaseDate < asOfDate,
          sourceDemandIds: [...new Set(datedNeeds.flatMap((need) => [...need.demandIds]))].sort(),
        };
        recommendations.push(recommendation);
        bucketRecommendations.push(recommendation);
        projected = projected.plus(plannedQty);
      }
      buckets.push({
        itemId,
        date: key,
        grossRequirements: gross.toString(),
        scheduledReceipts: scheduled.toString(),
        projectedAvailable: projected.toString(),
        netRequirements: net.toString(),
        recommendations: bucketRecommendations,
      });
    }
  }

  return {
    buckets: buckets.sort((left, right) => left.date.localeCompare(right.date) || left.itemId.localeCompare(right.itemId)),
    recommendations: recommendations.sort((left, right) => left.requiredDate.localeCompare(right.requiredDate) || left.itemId.localeCompare(right.itemId)),
  };
}
