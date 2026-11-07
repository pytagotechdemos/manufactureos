import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/);

export const itemCreateSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().uuid(),
  itemType: z.enum(["RAW_MATERIAL", "PURCHASED_COMPONENT", "SUB_ASSEMBLY", "FINISHED_GOODS", "CONSUMABLE"]),
  supplyType: z.enum(["MAKE", "BUY"]),
  baseUomId: z.string().uuid(),
  standardMaterialCost: decimalString.optional(),
  reorderPoint: decimalString.default("0"),
  safetyStock: decimalString.default("0"),
  purchasingLeadDays: z.number().int().min(0).max(3650).default(0),
  minimumOrderQty: decimalString.default("0"),
  lotSizeMultiple: decimalString.default("0"),
}).superRefine((value, context) => {
  for (const key of ["reorderPoint", "safetyStock", "minimumOrderQty", "lotSizeMultiple"] as const) {
    if (!new Decimal(value[key]).greaterThanOrEqualTo(0)) {
      context.addIssue({ code: "custom", path: [key], message: "Value must be non-negative" });
    }
  }
  if (value.standardMaterialCost && !new Decimal(value.standardMaterialCost).greaterThanOrEqualTo(0)) {
    context.addIssue({ code: "custom", path: ["standardMaterialCost"], message: "Cost must be non-negative" });
  }
});

export const itemListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
