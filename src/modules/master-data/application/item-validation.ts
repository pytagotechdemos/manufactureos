import Decimal from "decimal.js";
import { z } from "zod";

const decimalString = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/);

function isNonNegativeDecimal(value: string | undefined): boolean {
  if (value === undefined) return true;
  try {
    return new Decimal(value).greaterThanOrEqualTo(0);
  } catch {
    return false;
  }
}

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
    if (!isNonNegativeDecimal(value[key])) {
      context.addIssue({ code: "custom", path: [key], message: "Value must be non-negative" });
    }
  }
  if (value.standardMaterialCost && !isNonNegativeDecimal(value.standardMaterialCost)) {
    context.addIssue({ code: "custom", path: ["standardMaterialCost"], message: "Cost must be non-negative" });
  }
});

export const itemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: z.string().uuid().optional(),
  standardMaterialCost: decimalString.optional().nullable(),
  reorderPoint: decimalString.optional(),
  safetyStock: decimalString.optional(),
  purchasingLeadDays: z.number().int().min(0).max(3650).optional(),
  minimumOrderQty: decimalString.optional(),
  lotSizeMultiple: decimalString.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).superRefine((value, context) => {
  for (const key of ["reorderPoint", "safetyStock", "minimumOrderQty", "lotSizeMultiple"] as const) {
    if (value[key] !== undefined && !isNonNegativeDecimal(value[key])) {
      context.addIssue({ code: "custom", path: [key], message: "Value must be non-negative" });
    }
  }
  if (value.standardMaterialCost && !isNonNegativeDecimal(value.standardMaterialCost)) {
    context.addIssue({ code: "custom", path: ["standardMaterialCost"], message: "Cost must be non-negative" });
  }
});

export const itemListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const categoryCreateSchema = z.object({
  code: z.string().trim().min(1).max(20).toUpperCase(),
  name: z.string().trim().min(1).max(80),
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
