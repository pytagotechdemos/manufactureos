import { describe, expect, it } from "vitest";
import { type BomInput } from "@/modules/engineering/domain/bom-types";
import { explodeBom } from "@/modules/engineering/domain/bom-explosion";

function bom(overrides: Partial<BomInput>): BomInput {
  return {
    bomId: "root-bom",
    outputItemId: "desk",
    outputQuantity: "1",
    lines: [],
    ...overrides,
  };
}

describe("explodeBom", () => {
  it("explodes a single-level BOM and applies scrap", () => {
    const result = explodeBom(
      bom({
        lines: [
          { componentItemId: "board", quantity: "2", scrapRate: "0.1", uom: "EA", make: false },
          { componentItemId: "screw", quantity: "8", scrapRate: "0", uom: "EA", make: false },
        ],
      }),
      "3",
    );

    expect(result.requirements).toEqual([
      { itemId: "board", quantity: "6.6", uom: "EA" },
      { itemId: "screw", quantity: "24", uom: "EA" },
    ]);
  });

  it("normalizes a BOM output quantity greater than one", () => {
    const result = explodeBom(
      bom({ outputQuantity: "4", lines: [{ componentItemId: "leg", quantity: "8", scrapRate: "0", uom: "EA", make: false }] }),
      "10",
    );

    expect(result.requirements).toEqual([{ itemId: "leg", quantity: "20", uom: "EA" }]);
  });

  it("multiplies nested quantities and aggregates shared components", () => {
    const root = bom({
      lines: [
        { componentItemId: "top-assembly", quantity: "1", scrapRate: "0", uom: "EA", make: true },
        { componentItemId: "leg-assembly", quantity: "2", scrapRate: "0", uom: "EA", make: true },
      ],
    });
    const top = bom({
      bomId: "top-bom",
      outputItemId: "top-assembly",
      lines: [{ componentItemId: "board", quantity: "3", scrapRate: "0", uom: "EA", make: false }],
    });
    const legs = bom({
      bomId: "legs-bom",
      outputItemId: "leg-assembly",
      lines: [{ componentItemId: "board", quantity: "2", scrapRate: "0", uom: "EA", make: false }],
    });

    const result = explodeBom(root, "5", new Map([["top-assembly", [top]], ["leg-assembly", [legs]]]));

    expect(result.requirements).toEqual([{ itemId: "board", quantity: "35", uom: "EA" }]);
  });

  it("rejects a missing MAKE child BOM", () => {
    expect(() =>
      explodeBom(
        bom({ lines: [{ componentItemId: "assembly", quantity: "1", scrapRate: "0", uom: "EA", make: true }] }),
        "1",
      ),
    ).toThrow(/MAKE component assembly has no BOM/);
  });

  it("rejects indirect cycles", () => {
    const root = bom({ lines: [{ componentItemId: "child", quantity: "1", scrapRate: "0", uom: "EA", make: true }] });
    const child = bom({
      bomId: "child-bom",
      outputItemId: "child",
      lines: [{ componentItemId: "desk", quantity: "1", scrapRate: "0", uom: "EA", make: true }],
    });

    expect(() => explodeBom(root, "1", new Map([["child", [child]]]))).toThrow(/BOM cycle detected/);
  });

  it("normalizes BOM component quantities to the item's base UOM", () => {
    const result = explodeBom(
      bom({ lines: [{ componentItemId: "board", quantity: "1250", scrapRate: "0", uom: "MM", make: false }] }),
      "1",
      new Map(),
      {
        itemUnits: new Map([["desk", { baseUom: "EA", dimension: "COUNT", precision: 0 }], ["board", { baseUom: "M", dimension: "LENGTH", precision: 3 }]]),
        uoms: new Map([["MM", { code: "MM", dimension: "LENGTH", precision: 0 }], ["M", { code: "M", dimension: "LENGTH", precision: 3 }]]),
        conversions: [{ from: "MM", to: "M", factor: "0.001", dimension: "LENGTH" }],
      },
    );

    expect(result.requirements).toEqual([{ itemId: "board", quantity: "1.25", uom: "M" }]);
  });

  it("rejects zero and invalid quantities", () => {
    expect(() => explodeBom(bom({ outputQuantity: "0" }), "1")).toThrow(/must be positive/);
    expect(() => explodeBom(bom({}), "0")).toThrow(/must be positive/);
    expect(() => explodeBom(bom({ lines: [{ componentItemId: "x", quantity: "bad", scrapRate: "0", uom: "EA", make: false }] }), "1")).toThrow(/finite non-negative/);
  });
});
