import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/);

export const bomLineSchema = z.object({
  componentItemId: z.string().uuid(),
  quantity: decimalString.refine((value) => new Decimal(value).greaterThan(0), "Quantity must be positive"),
  uomId: z.string().uuid(),
  scrapRate: decimalString.refine((value) => new Decimal(value).greaterThanOrEqualTo(0), "Scrap rate must be non-negative"),
  notes: z.string().trim().max(500).optional(),
});

export const bomDraftSchema = z.object({
  number: z.string().trim().min(1).max(40),
  outputItemId: z.string().uuid(),
  revision: z.string().trim().min(1).max(20),
  outputQuantity: decimalString.refine((value) => new Decimal(value).greaterThan(0), "Output quantity must be positive"),
  effectiveDate: z.coerce.date().optional(),
  lines: z.array(bomLineSchema).max(500),
});

export type BomDraftInput = z.infer<typeof bomDraftSchema>;
