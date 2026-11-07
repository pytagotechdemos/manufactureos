import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThan(0));

export const bomExplosionQuerySchema = z.object({
  quantity: decimalString.default("1"),
});

export const bomListSchema = z.object({
  outputItemId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "OBSOLETE"]).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
