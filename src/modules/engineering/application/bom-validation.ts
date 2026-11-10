import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/);

export const bomLineSchema = z.object({
  componentItemId: z.string().uuid(),
  quantity: decimalString.refine((value) => new Decimal(value).greaterThan(0), "Quantity must be positive"),
  uomId: z.string().uuid(),
  scrapRate: decimalString.refine((value) => {
    const val = new Decimal(value);
    return val.greaterThanOrEqualTo(0) && val.lessThan(1);
  }, "Scrap rate must be non-negative and less than 1"),
  notes: z.string().trim().max(500).optional(),
});

export const bomDraftSchema = z.object({
  number: z.string().trim().min(1).max(40),
  outputItemId: z.string().uuid(),
  revision: z.string().trim().min(1).max(20),
  outputQuantity: decimalString.refine((value) => new Decimal(value).greaterThan(0), "Output quantity must be positive"),
  effectiveDate: z.coerce.date().optional(),
  lines: z.array(bomLineSchema).max(500),
}).superRefine((bom, context) => {
  bom.lines.forEach((line, index) => {
    if (line.componentItemId === bom.outputItemId) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "componentItemId"],
        message: "BOM output cannot be its own component",
      });
    }
  });
});

export type BomDraftInput = z.infer<typeof bomDraftSchema>;

export const bomCloneSchema = z.object({
  number: z.string().trim().min(1).max(40),
  revision: z.string().trim().min(1).max(20),
  effectiveDate: z.coerce.date().optional(),
});

export type BomCloneInput = z.infer<typeof bomCloneSchema>;

