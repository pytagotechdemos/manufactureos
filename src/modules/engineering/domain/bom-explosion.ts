import Decimal from "decimal.js";
import { BomDomainError, type BomInput, type BomItemUnit, type BomUomConversion, type BomUnit, type ExplosionNode, type ExplosionRequirement } from "./bom-types";
import { normalizeToBaseUom, UomConversionError } from "./uom-conversion";

export type BomCatalog = ReadonlyMap<string, readonly BomInput[]>;

export type BomExplosionContext = {
  itemUnits: ReadonlyMap<string, BomItemUnit>;
  uoms: ReadonlyMap<string, BomUnit>;
  conversions: readonly BomUomConversion[];
};

type RequirementTotal = {
  itemId: string;
  uom: string;
  quantity: Decimal;
};

type WalkResult = {
  node: ExplosionNode;
  requirements: Map<string, RequirementTotal>;
};

function decimal(value: string, code: "INVALID_QUANTITY" | "INVALID_SCRAP_RATE", label: string) {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || parsed.isNegative()) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new BomDomainError(code, `${label} must be a finite non-negative decimal`);
  }
}

function addRequirement(
  target: Map<string, RequirementTotal>,
  itemId: string,
  uom: string,
  quantity: Decimal,
) {
  const key = `${itemId}\u0000${uom}`;
  const existing = target.get(key);
  target.set(key, { itemId, uom, quantity: (existing?.quantity ?? new Decimal(0)).plus(quantity) });
}

function getChildBom(catalog: BomCatalog, itemId: string) {
  const candidates = (catalog.get(itemId) ?? []).filter((bom) => bom.lines.length > 0);

  if (candidates.length > 1) {
    throw new BomDomainError("AMBIGUOUS_CHILD_BOM", `More than one child BOM is defined for item ${itemId}`);
  }

  return candidates[0];
}

function explodeItem(
  itemId: string,
  requiredQuantity: Decimal,
  uom: string,
  bom: BomInput | undefined,
  catalog: BomCatalog,
  path: readonly string[],
  context?: BomExplosionContext,
): WalkResult {
  if (path.includes(itemId)) {
    throw new BomDomainError("BOM_CYCLE", `BOM cycle detected: ${[...path, itemId].join(" -> ")}`);
  }

  const currentPath = [...path, itemId];
  if (!bom) {
    return {
      node: { itemId, quantity: requiredQuantity.toString(), uom, path: currentPath, children: [] },
      requirements: new Map([[`${itemId}\u0000${uom}`, { itemId, uom, quantity: requiredQuantity }]]),
    };
  }

  if (bom.outputItemId !== itemId) {
    throw new BomDomainError("INVALID_QUANTITY", `BOM ${bom.bomId} output item does not match ${itemId}`);
  }

  const outputQuantity = decimal(bom.outputQuantity, "INVALID_QUANTITY", "BOM output quantity");
  if (outputQuantity.isZero()) {
    throw new BomDomainError("INVALID_QUANTITY", `BOM ${bom.bomId} output quantity must be positive`);
  }

  const factor = requiredQuantity.div(outputQuantity);
  const requirements = new Map<string, RequirementTotal>();
  const children: ExplosionNode[] = [];

  for (const line of bom.lines) {
    const lineQuantity = decimal(line.quantity, "INVALID_QUANTITY", "BOM component quantity");
    if (lineQuantity.isZero()) {
      throw new BomDomainError("INVALID_QUANTITY", `Component ${line.componentItemId} quantity must be positive`);
    }

    const scrapRate = decimal(line.scrapRate, "INVALID_SCRAP_RATE", "BOM scrap rate");
    if (scrapRate.greaterThanOrEqualTo(1)) {
      throw new BomDomainError("INVALID_SCRAP_RATE", "Scrap rate must be less than 1");
    }

    const grossQuantity = lineQuantity.mul(factor).mul(new Decimal(1).plus(scrapRate));
    let childQuantity = grossQuantity;
    let childUom = line.uom;
    if (context) {
      const childUnit = context.itemUnits.get(line.componentItemId);
      const sourceUnit = context.uoms.get(line.uom);
      if (!childUnit || !sourceUnit) {
        throw new BomDomainError("UOM_CONVERSION", `Missing UOM metadata for component ${line.componentItemId}`);
      }
      try {
        childQuantity = new Decimal(normalizeToBaseUom(
          grossQuantity.toString(),
          sourceUnit.code,
          childUnit.baseUom,
          [sourceUnit, { code: childUnit.baseUom, dimension: childUnit.dimension, precision: childUnit.precision }],
          context.conversions.filter((conversion) => conversion.dimension === childUnit.dimension),
        ));
      } catch (error) {
        if (error instanceof UomConversionError) {
          throw new BomDomainError("UOM_CONVERSION", error.message);
        }
        throw error;
      }
      childUom = childUnit.baseUom;
    }
    const childBom = line.make ? getChildBom(catalog, line.componentItemId) : undefined;
    if (line.make && !childBom) {
      throw new BomDomainError("MISSING_CHILD_BOM", `MAKE component ${line.componentItemId} has no BOM`);
    }

    const result = explodeItem(line.componentItemId, childQuantity, childUom, childBom, catalog, currentPath, context);
    children.push(result.node);
    for (const requirement of result.requirements.values()) {
      addRequirement(requirements, requirement.itemId, requirement.uom, requirement.quantity);
    }
  }

  return {
    node: { itemId, quantity: requiredQuantity.toString(), uom, path: currentPath, children },
    requirements,
  };
}

export function explodeBom(
  root: BomInput,
  requestedOutputQuantity: string,
  catalog: BomCatalog = new Map(),
  context?: BomExplosionContext,
): { tree: ExplosionNode; requirements: readonly ExplosionRequirement[] } {
  const requested = decimal(requestedOutputQuantity, "INVALID_QUANTITY", "Requested output quantity");
  if (requested.isZero()) {
    throw new BomDomainError("INVALID_QUANTITY", "Requested output quantity must be positive");
  }

  const availableCatalog = new Map(catalog);
  availableCatalog.set(root.outputItemId, [root]);
  const rootUom = context?.itemUnits.get(root.outputItemId)?.baseUom ?? "BASE";
  const result = explodeItem(root.outputItemId, requested, rootUom, root, availableCatalog, [], context);

  return {
    tree: result.node,
    requirements: [...result.requirements.values()]
      .map(({ itemId, quantity, uom }) => ({ itemId, quantity: quantity.toString(), uom }))
      .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.uom.localeCompare(right.uom)),
  };
}

export function assertNoBomCycle(candidate: BomInput, catalog: BomCatalog, context?: BomExplosionContext) {
  explodeBom(candidate, "1", catalog, context);
}
