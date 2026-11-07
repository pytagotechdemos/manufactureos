import Decimal from "decimal.js";
import { z } from "zod";

const nonnegative = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThanOrEqualTo(0));
const positive = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThan(0));

export const qcInspectionCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  manufacturingOrderId: z.string().uuid(),
  workOrderId: z.string().uuid().optional(),
  inspectedQty: positive,
  acceptedQty: nonnegative,
  rejectedQty: nonnegative,
  reworkQty: nonnegative,
  defectCode: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  const total = new Decimal(value.acceptedQty).plus(value.rejectedQty).plus(value.reworkQty);
  if (!total.equals(value.inspectedQty)) context.addIssue({ code: "custom", path: ["inspectedQty"], message: "Inspected quantity must equal accepted + rejected + rework" });
});

export const productionReceiptCreateSchema = z.object({
  number: z.string().trim().min(1).max(40),
  manufacturingOrderId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  acceptedQty: positive,
  idempotencyKey: z.string().trim().min(8).max(120),
});
