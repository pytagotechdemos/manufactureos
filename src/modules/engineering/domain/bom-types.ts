export type BomLineInput = {
  componentItemId: string;
  quantity: string;
  scrapRate: string;
  uom: string;
  make: boolean;
};

export type BomUomConversion = {
  from: string;
  to: string;
  factor: string;
  dimension: string;
};

export type BomItemUnit = {
  baseUom: string;
  dimension: string;
  precision: number;
};

export type BomUnit = {
  code: string;
  dimension: string;
  precision: number;
};

export type BomInput = {
  bomId: string;
  outputItemId: string;
  outputQuantity: string;
  lines: readonly BomLineInput[];
};

export type ExplosionNode = {
  itemId: string;
  quantity: string;
  uom: string;
  path: readonly string[];
  children: readonly ExplosionNode[];
};

export type ExplosionRequirement = {
  itemId: string;
  quantity: string;
  uom: string;
  itemSku?: string;
  itemName?: string;
};

export type BomErrorCode =
  | "INVALID_QUANTITY"
  | "INVALID_SCRAP_RATE"
  | "BOM_CYCLE"
  | "MISSING_CHILD_BOM"
  | "AMBIGUOUS_CHILD_BOM"
  | "UOM_CONVERSION";

export class BomDomainError extends Error {
  constructor(
    readonly code: BomErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BomDomainError";
  }
}
