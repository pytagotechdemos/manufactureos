import Decimal from "decimal.js";
import { z } from "zod";

const positive = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/).refine((value) => new Decimal(value).greaterThan(0));
const nonnegative = z.string().trim().regex(/^\d{1,15}(\.\d{1,4})?$/).refine((value) => new Decimal(value).greaterThanOrEqualTo(0));

export const purchaseRequestCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  supplierId: z.string().uuid().optional(),
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: positive,
    uomId: z.string().uuid(),
    neededBy: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional(),
  })).min(1).max(500),
});

export const purchaseRequestListSchema = z.object({
  status: z.enum(["DRAFT", "APPROVED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const purchaseOrderCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  expectedDelivery: z.coerce.date().optional(),
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    quantity: positive,
    unitCost: nonnegative,
    uomId: z.string().uuid(),
    requestLineId: z.string().uuid().optional(),
    requestQuantity: positive.optional(),
  }).superRefine((line, context) => {
    if (Boolean(line.requestLineId) !== Boolean(line.requestQuantity)) {
      context.addIssue({ code: "custom", path: ["requestLineId"], message: "Request line and allocation quantity must be supplied together" });
    }
  })).min(1).max(500),
});

export const goodsReceiptCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
  lines: z.array(z.object({
    purchaseOrderLineId: z.string().uuid(),
    quantity: positive,
  })).min(1).max(500).superRefine((lines, context) => {
    const seen = new Set<string>();
    lines.forEach((line, index) => {
      if (seen.has(line.purchaseOrderLineId)) context.addIssue({ code: "custom", path: [index, "purchaseOrderLineId"], message: "A purchase order line may appear only once per receipt" });
      seen.add(line.purchaseOrderLineId);
    });
  }),
});

export const purchaseOrderListSchema = z.object({
  status: z.enum(["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED", "CLOSED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
