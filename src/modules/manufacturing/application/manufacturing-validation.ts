import Decimal from "decimal.js";
import { z } from "zod";

const positive = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/).refine((value) => new Decimal(value).greaterThan(0));

export const materialIssueSchema = z.object({
  quantity: positive,
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const materialDispositionSchema = materialIssueSchema;

export const manufacturingOrderCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  recommendationId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  wipWarehouseId: z.string().uuid(),
});

export const manufacturingOrderListSchema = z.object({
  status: z.enum(["DRAFT", "PLANNED", "RELEASED", "IN_PROGRESS", "QC_PENDING", "COMPLETED", "ON_HOLD", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
