import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { z } from "zod";

const conversionInputSchema = z.object({
  fromUomId: z.string().uuid(),
  toUomId: z.string().uuid(),
  factor: z.string().trim().regex(/^\d{1,12}(\.\d{1,12})?$/).refine((value) => new Decimal(value).greaterThan(0)),
});

describe("UOM conversion validation", () => {
  it("accepts positive precise decimal factors", () => {
    expect(conversionInputSchema.safeParse({
      fromUomId: "fba4dc67-6754-4c4c-a1a5-a15e68b3fca0",
      toUomId: "299fa133-c18d-4b1a-8aee-97ba0250320b",
      factor: "0.001250000001",
    }).success).toBe(true);
  });

  it("rejects factors with more precision than Decimal(24,12) can store", () => {
    const input = {
      fromUomId: "fba4dc67-6754-4c4c-a1a5-a15e68b3fca0",
      toUomId: "299fa133-c18d-4b1a-8aee-97ba0250320b",
      factor: "0.0000000000005",
    };
    expect(conversionInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects zero, negative, and exponent-notation factors", () => {
    const input = {
      fromUomId: "fba4dc67-6754-4c4c-a1a5-a15e68b3fca0",
      toUomId: "299fa133-c18d-4b1a-8aee-97ba0250320b",
      factor: "0",
    };
    expect(conversionInputSchema.safeParse(input).success).toBe(false);
    expect(conversionInputSchema.safeParse({ ...input, factor: "-1" }).success).toBe(false);
    expect(conversionInputSchema.safeParse({ ...input, factor: "1e3" }).success).toBe(false);
  });
});
