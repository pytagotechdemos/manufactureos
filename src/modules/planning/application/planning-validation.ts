import Decimal from "decimal.js";
import { z } from "zod";

const positive = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThan(0));

export const productionDemandCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: positive,
    requiredDate: z.coerce.date(),
  })).min(1).max(500),
});

export const demandListSchema = z.object({
  status: z.enum(["DRAFT", "RELEASED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const mrpRunSchema = z.object({
  runNumber: z.string().trim().min(1).max(40),
  asOfDate: z.coerce.date(),
  horizonDays: z.coerce.number().int().min(1).max(365).default(90),
  demandIds: z.array(z.string().uuid()).max(500).optional(),
});
