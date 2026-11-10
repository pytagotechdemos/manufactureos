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

type GrossNeed = { itemId: string; quantity: Decimal; date: Date; demandIds: Set<string>; paths: readonly (readonly string[])[] };

function explodeMakeNeeds(initialNeeds: GrossNeed[], input: MrpInput): GrossNeed[] {
  const expanded: GrossNeed[] = [];
  let layer = initialNeeds;
  const projected = new Map([...input.availableStock.entries()].map(([id, quantity]) => [id, decimal(quantity, "Available stock")]));
  const supply = new Map<string, Array<{ date: Date; quantity: Decimal }>>();
  for (const row of input.confirmedSupply) {
    const item = input.items.find((candidate) => candidate.itemId === row.itemId);
    if (item?.supplyType !== "MAKE" || row.supplyType !== "MANUFACTURING_ORDER") continue;
    const rows = supply.get(row.itemId) ?? [];
    rows.push({ date: date(row.availableDate, "Supply available date"), quantity: decimal(row.quantity, "Supply quantity", false) });
    supply.set(row.itemId, rows);
  }
  while (layer.length > 0) {
    const grouped = new Map<string, GrossNeed>();
    for (const need of layer) {
      if (need.paths.some((path) => path.includes(need.itemId))) {
        const path = need.paths.find((candidate) => candidate.includes(need.itemId)) ?? [];
        throw new MrpError("BOM_CYCLE", `MRP BOM cycle detected: ${[...path, need.itemId].join(" -> ")}`);
      }
      const key = `${need.itemId}\u0000${dateKey(need.date)}`;
      const group = grouped.get(key) ?? { itemId: need.itemId, quantity: new Decimal(0), date: need.date, demandIds: new Set<string>(), paths: [] };
      group.quantity = group.quantity.plus(need.quantity);
      for (const id of need.demandIds) group.demandIds.add(id);
      group.paths = [...group.paths, ...need.paths];
      grouped.set(key, group);
    }
    const next: GrossNeed[] = [];
    for (const need of [...grouped.values()].sort((left, right) => left.date.getTime() - right.date.getTime() || left.itemId.localeCompare(right.itemId))) {
      const item = input.items.find((candidate) => candidate.itemId === need.itemId);
      if (!item) throw new MrpError("MISSING_ITEM", `MRP item ${need.itemId} is missing`);
      if (item.supplyType === "BUY") { expanded.push(need); continue; }
      expanded.push(need);
      let remaining = need.quantity;
      const onHand = projected.get(need.itemId) ?? new Decimal(0);
      const usedStock = Decimal.min(onHand, remaining);
      remaining = remaining.minus(usedStock);
      let usedSupply = new Decimal(0);
      const dated = (supply.get(need.itemId) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const receipt of dated) {
        if (receipt.date > need.date || remaining.isZero()) continue;
        const used = Decimal.min(receipt.quantity, remaining);
        receipt.quantity = receipt.quantity.minus(used);
        remaining = remaining.minus(used);
        usedSupply = usedSupply.plus(used);
      }
      supply.set(need.itemId, dated.filter((row) => row.quantity.greaterThan(0)));
      const availableBeforeDemand = onHand.plus(usedSupply);
      const safety = decimal(item.safetyStock, "Safety stock");
      const buildNeed = Decimal.max(need.quantity.plus(safety).minus(availableBeforeDemand), new Decimal(0));
      const build = buildNeed.greaterThan(0) ? roundLot(buildNeed, item) : new Decimal(0);
      projected.set(need.itemId, availableBeforeDemand.plus(build).minus(need.quantity));
      if (build.isZero()) continue;
      const bom = effectiveBomFor(need.itemId, need.date, input.boms);
      if (!bom) throw new MrpError("MISSING_BOM", `No effective approved BOM exists for MAKE item ${need.itemId} on ${dateKey(need.date)}`);
      const factor = build.div(decimal(bom.outputQuantity, "BOM output quantity", false));
      const componentDate = addDays(need.date, -item.leadTimeDays);
      for (const line of bom.lines) {
        const qty = decimal(line.quantityPerOutput, "BOM component quantity", false);
        const scrap = decimal(line.scrapRate, "BOM scrap rate");
        next.push({ itemId: line.componentItemId, quantity: qty.mul(factor).mul(new Decimal(1).plus(scrap)), date: componentDate, demandIds: new Set(need.demandIds), paths: need.paths.map((path) => [...path, need.itemId]) });
      }
    }
    layer = next;
  }
  return expanded;
}

export function calculateMrp(input: MrpInput): MrpResult {
  const asOfDate = date(input.asOfDate, "MRP as-of date");
  const items = new Map(input.items.map((item) => [item.itemId, item]));
  const initialNeeds: GrossNeed[] = [];

  const demands = [...input.demands].sort((left, right) => left.requiredDate.localeCompare(right.requiredDate) || left.itemId.localeCompare(right.itemId) || left.demandId.localeCompare(right.demandId));
  for (const demand of demands) {
    const requiredDate = date(demand.requiredDate, "Demand required date");
    const quantity = decimal(demand.quantity, "Demand quantity", false);
    const item = items.get(demand.itemId);
    if (!item) throw new MrpError("MISSING_ITEM", `MRP item ${demand.itemId} is missing`);
    initialNeeds.push({ itemId: item.itemId, quantity, date: requiredDate, demandIds: new Set([demand.demandId]), paths: [[]] });
  }
  const needs = explodeMakeNeeds(initialNeeds, input);

  const byItem = new Map<string, GrossNeed[]>();
  for (const need of needs) byItem.set(need.itemId, [...(byItem.get(need.itemId) ?? []), need]);
  const recommendations: MrpRecommendation[] = [];
  const buckets: MrpBucket[] = [];

  const relevantItemIds = [...new Set([
    ...byItem.keys(),
    ...input.confirmedSupply.map((receipt) => receipt.itemId),
  ])].sort();

  for (const itemId of relevantItemIds) {
    const itemNeeds = byItem.get(itemId) ?? [];
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
          late: dateKey(releaseDate) < dateKey(asOfDate),
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
