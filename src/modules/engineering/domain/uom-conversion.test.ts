import { describe, expect, it } from "vitest";
import { normalizeToBaseUom, UomConversionError } from "@/modules/engineering/domain/uom-conversion";

const units = [
  { code: "MM", dimension: "LENGTH", precision: 3 },
  { code: "M", dimension: "LENGTH", precision: 3 },
  { code: "EA", dimension: "COUNT", precision: 0 },
];

describe("UOM conversion", () => {
  it("converts with exact decimal arithmetic and rounds at the target", () => {
    expect(normalizeToBaseUom("1250", "MM", "M", units, [{ from: "MM", to: "M", factor: "0.001" }])).toBe("1.25");
  });

  it("supports directed conversion chains", () => {
    expect(normalizeToBaseUom("2", "MM", "M", units, [
      { from: "MM", to: "CM", factor: "0.1" },
      { from: "CM", to: "M", factor: "0.01" },
    ])).toBe("0.002");
  });

  it("rejects incompatible dimensions and missing paths", () => {
    expect(() => normalizeToBaseUom("1", "EA", "M", units, [])).toThrowError(UomConversionError);
    expect(() => normalizeToBaseUom("1", "MM", "M", units, [])).toThrow(/No conversion exists/);
  });

  it("rejects ambiguous conversion paths with different factors", () => {
    expect(() => normalizeToBaseUom("1", "MM", "M", units, [
      { from: "MM", to: "CM", factor: "0.1" },
      { from: "CM", to: "M", factor: "0.01" },
      { from: "MM", to: "M", factor: "0.002" },
    ])).toThrow(/Multiple conversion paths/);
  });

  it("rejects non-positive conversion factors", () => {
    expect(() => normalizeToBaseUom("1", "MM", "M", units, [{ from: "MM", to: "M", factor: "0" }])).toThrow(/must be positive/);
  });
});
