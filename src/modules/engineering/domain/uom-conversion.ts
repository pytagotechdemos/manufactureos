import Decimal from "decimal.js";

export type UomDefinition = {
  code: string;
  dimension: string;
  precision: number;
};

export type UomConversionDefinition = {
  from: string;
  to: string;
  factor: string;
};

export class UomConversionError extends Error {
  constructor(readonly code: "UNKNOWN_UOM" | "INCOMPATIBLE_DIMENSION" | "MISSING_CONVERSION" | "INVALID_FACTOR" | "AMBIGUOUS_CONVERSION", message: string) {
    super(message);
    this.name = "UomConversionError";
  }
}

function conversionFactor(
  fromCode: string,
  toCode: string,
  conversions: readonly UomConversionDefinition[],
) {
  if (fromCode === toCode) return new Decimal(1);

  const queue: { code: string; factor: Decimal; path: readonly string[] }[] = [
    { code: fromCode, factor: new Decimal(1), path: [fromCode] },
  ];

  let found: Decimal | undefined;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const conversion of conversions.filter((entry) => entry.from === current.code)) {
      if (current.path.includes(conversion.to)) continue;
      const factor = new Decimal(conversion.factor);
      if (!factor.isFinite() || !factor.greaterThan(0)) {
        throw new UomConversionError("INVALID_FACTOR", `Conversion factor from ${conversion.from} to ${conversion.to} must be positive`);
      }
      const combined = current.factor.mul(factor);
      if (conversion.to === toCode) {
        if (found && !found.eq(combined)) {
          throw new UomConversionError("AMBIGUOUS_CONVERSION", `Multiple conversion paths exist from ${fromCode} to ${toCode}`);
        }
        found = combined;
        continue;
      }
      queue.push({ code: conversion.to, factor: combined, path: [...current.path, conversion.to] });
    }
  }

  if (found) return found;
  throw new UomConversionError("MISSING_CONVERSION", `No conversion exists from ${fromCode} to ${toCode}`);
}

export function convertQuantity(
  quantity: string,
  from: UomDefinition,
  to: UomDefinition,
  conversions: readonly UomConversionDefinition[],
) {
  const value = new Decimal(quantity);
  if (!value.isFinite() || value.isNegative()) throw new UomConversionError("INVALID_FACTOR", "Quantity must be finite and non-negative");
  if (from.dimension !== to.dimension) {
    throw new UomConversionError("INCOMPATIBLE_DIMENSION", `${from.code} and ${to.code} have incompatible dimensions`);
  }
  const factor = conversionFactor(from.code, to.code, conversions);
  return value.mul(factor).toDecimalPlaces(to.precision, Decimal.ROUND_HALF_UP).toString();
}

export function normalizeToBaseUom(
  quantity: string,
  sourceCode: string,
  baseCode: string,
  definitions: readonly UomDefinition[],
  conversions: readonly UomConversionDefinition[],
) {
  const source = definitions.find((uom) => uom.code === sourceCode);
  const base = definitions.find((uom) => uom.code === baseCode);
  if (!source || !base) throw new UomConversionError("UNKNOWN_UOM", "Source and base units must exist");
  return convertQuantity(quantity, source, base, conversions);
}
