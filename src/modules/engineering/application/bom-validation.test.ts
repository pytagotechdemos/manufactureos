import { describe, expect, it } from "vitest";
import { bomDraftSchema } from "@/modules/engineering/application/bom-validation";

const validDraft = {
  number: "BOM-DESK-A",
  outputItemId: "c6ca53d8-74fb-4d6e-9b08-8939834fd851",
  revision: "A",
  outputQuantity: "1.000000",
  lines: [
    {
      componentItemId: "3287755f-dc3d-4da6-a906-b93494991244",
      quantity: "2.5",
      uomId: "c7616a0f-4efa-47d0-98c5-580bc5ef013a",
      scrapRate: "0.03",
    },
  ],
};

describe("BOM draft validation", () => {
  it("accepts precise decimal quantities and scrap", () => {
    expect(bomDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects zero output and component quantities", () => {
    expect(bomDraftSchema.safeParse({ ...validDraft, outputQuantity: "0" }).success).toBe(false);
    const invalidLine = { ...validDraft, lines: [{ ...validDraft.lines[0], quantity: "0" }] };
    expect(bomDraftSchema.safeParse(invalidLine).success).toBe(false);
  });

  it("rejects negative scrap and invalid decimal syntax", () => {
    const negativeScrap = { ...validDraft, lines: [{ ...validDraft.lines[0], scrapRate: "-0.01" }] };
    const excessiveScrap = { ...validDraft, lines: [{ ...validDraft.lines[0], scrapRate: "1" }] };
    const exponential = { ...validDraft, outputQuantity: "1e3" };
    expect(bomDraftSchema.safeParse(negativeScrap).success).toBe(false);
    expect(bomDraftSchema.safeParse(excessiveScrap).success).toBe(false);
    expect(bomDraftSchema.safeParse(exponential).success).toBe(false);
  });

  it("rejects output item used as its own component line", () => {
    const selfReferencing = {
      ...validDraft,
      lines: [{ ...validDraft.lines[0], componentItemId: validDraft.outputItemId }],
    };
    expect(bomDraftSchema.safeParse(selfReferencing).success).toBe(false);
  });
});
