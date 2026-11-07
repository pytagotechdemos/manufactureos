import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Permission } from "@/lib/permissions";
import { itemCreateSchema, itemListSchema } from "./item-validation";

export class MasterDataError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.name = "MasterDataError";
  }
}

function toDecimal(value: string | undefined) {
  return value === undefined ? undefined : new Prisma.Decimal(value);
}

export class ItemService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: unknown) {
    const parsed = itemListSchema.safeParse(input);
    if (!parsed.success) throw new MasterDataError("INVALID_INPUT", parsed.error.message);
    const { search, status, limit, offset } = parsed.data;
    const where: Prisma.ItemWhereInput = {
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { sku: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ sku: "asc" }],
        include: { category: true, baseUom: true },
      }),
      this.prisma.item.count({ where }),
    ]);
    return { data: items, page: { limit, offset, total } };
  }

  async create(actorId: string, input: unknown) {
    const parsed = itemCreateSchema.safeParse(input);
    if (!parsed.success) throw new MasterDataError("INVALID_INPUT", parsed.error.message);
    const values = parsed.data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [category, uom] = await Promise.all([
          transaction.itemCategory.findFirst({ where: { id: values.categoryId, status: "ACTIVE" }, select: { id: true } }),
          transaction.unitOfMeasure.findFirst({ where: { id: values.baseUomId, status: "ACTIVE" }, select: { id: true } }),
        ]);
        if (!category || !uom) throw new MasterDataError("INVALID_INPUT", "Category and base UOM must be active");

        const item = await transaction.item.create({
          data: {
            sku: values.sku,
            name: values.name,
            description: values.description,
            categoryId: values.categoryId,
            itemType: values.itemType,
            supplyType: values.supplyType,
            baseUomId: values.baseUomId,
            standardMaterialCost: toDecimal(values.standardMaterialCost),
            reorderPoint: new Prisma.Decimal(values.reorderPoint),
            safetyStock: new Prisma.Decimal(values.safetyStock),
            purchasingLeadDays: values.purchasingLeadDays,
            minimumOrderQty: new Prisma.Decimal(values.minimumOrderQty),
            lotSizeMultiple: new Prisma.Decimal(values.lotSizeMultiple),
          },
          include: { category: true, baseUom: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "item.created",
            entityType: "Item",
            entityId: item.id,
            source: "master-data",
            metadata: { sku: item.sku },
          },
        });
        return item;
      });
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MasterDataError("CONFLICT", "SKU is already in use");
      }
      throw error;
    }
  }

  async setStatus(actorId: string, itemId: string, status: "ACTIVE" | "INACTIVE") {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const item = await transaction.item.update({
          where: { id: itemId },
          data: { status },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: status === "ACTIVE" ? "item.activated" : "item.deactivated",
            entityType: "Item",
            entityId: item.id,
            source: "master-data",
            metadata: { sku: item.sku, status },
          },
        });
        return item;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new MasterDataError("NOT_FOUND", "Item not found");
      }
      throw error;
    }
  }
}

export const itemReadPermission: Permission = "item.read";
