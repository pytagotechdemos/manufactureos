import "server-only";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Permission } from "@/lib/permissions";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  itemCreateSchema,
  itemListSchema,
  itemUpdateSchema,
} from "./item-validation";

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

  async activeUoms() {
    return this.prisma.unitOfMeasure.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, dimension: true, precision: true },
    });
  }

  async listUoms() {
    return this.prisma.unitOfMeasure.findMany({
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, dimension: true, precision: true, status: true, createdAt: true },
    });
  }

  async createUom(actorId: string, input: unknown) {
    const schema = z.object({
      code: z.string().trim().min(1).max(20).toUpperCase(),
      name: z.string().trim().min(1).max(80),
      dimension: z.string().trim().min(1).max(50),
      precision: z.number().int().min(0).max(6).default(3),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new MasterDataError("INVALID_INPUT", parsed.error.message);
    const values = parsed.data;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const uom = await transaction.unitOfMeasure.create({
          data: { code: values.code.toUpperCase(), name: values.name, dimension: values.dimension, precision: values.precision },
        });
        await transaction.auditLog.create({
          data: { actorId, action: "uom.created", entityType: "UnitOfMeasure", entityId: uom.id, source: "master-data", metadata: { code: uom.code } },
        });
        return uom;
      });
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MasterDataError("CONFLICT", "UOM code is already in use");
      }
      throw error;
    }
  }

  async setUomStatus(actorId: string, uomId: string, status: "ACTIVE" | "INACTIVE") {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const uom = await transaction.unitOfMeasure.update({ where: { id: uomId }, data: { status } });
        await transaction.auditLog.create({
          data: { actorId, action: status === "ACTIVE" ? "uom.activated" : "uom.deactivated", entityType: "UnitOfMeasure", entityId: uom.id, source: "master-data", metadata: { code: uom.code } },
        });
        return uom;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new MasterDataError("NOT_FOUND", "UOM not found");
      }
      throw error;
    }
  }

  async activeCategories() {
    return this.prisma.itemCategory.findMany({
      where: { status: "ACTIVE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    });
  }

  async listCategories(includeAll = false) {
    return this.prisma.itemCategory.findMany({
      where: includeAll ? {} : { status: "ACTIVE" },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    });
  }

  async createCategory(actorId: string, input: unknown) {
    const parsed = categoryCreateSchema.safeParse(input);
    if (!parsed.success) {
      throw new MasterDataError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Format data kategori tidak valid");
    }
    const values = parsed.data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.itemCategory.create({
          data: { code: values.code.toUpperCase(), name: values.name },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "category.created",
            entityType: "ItemCategory",
            entityId: category.id,
            source: "master-data",
            metadata: { code: category.code, name: category.name },
          },
        });
        return category;
      });
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MasterDataError("CONFLICT", "Kode kategori sudah digunakan");
      }
      throw error;
    }
  }

  async setCategoryStatus(actorId: string, categoryId: string, status: "ACTIVE" | "INACTIVE") {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.itemCategory.update({
          where: { id: categoryId },
          data: { status },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: status === "ACTIVE" ? "category.activated" : "category.deactivated",
            entityType: "ItemCategory",
            entityId: category.id,
            source: "master-data",
            metadata: { code: category.code, name: category.name },
          },
        });
        return category;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new MasterDataError("NOT_FOUND", "Kategori tidak ditemukan");
      }
      throw error;
    }
  }

  async updateCategory(actorId: string, categoryId: string, input: unknown) {
    const parsed = categoryUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new MasterDataError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Format data kategori tidak valid");
    }
    const values = parsed.data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const category = await transaction.itemCategory.update({
          where: { id: categoryId },
          data: {
            ...(values.name !== undefined ? { name: values.name } : {}),
            ...(values.status !== undefined ? { status: values.status } : {}),
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "category.updated",
            entityType: "ItemCategory",
            entityId: category.id,
            source: "master-data",
            metadata: { code: category.code, changes: values },
          },
        });
        return category;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new MasterDataError("NOT_FOUND", "Kategori tidak ditemukan");
      }
      throw error;
    }
  }

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

  async update(actorId: string, itemId: string, input: unknown) {
    const parsed = itemUpdateSchema.safeParse(input);
    if (!parsed.success) throw new MasterDataError("INVALID_INPUT", parsed.error.message);
    const values = parsed.data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.item.findUnique({ where: { id: itemId } });
        if (!existing) throw new MasterDataError("NOT_FOUND", "Item not found");

        if (values.categoryId && values.categoryId !== existing.categoryId) {
          const category = await transaction.itemCategory.findFirst({
            where: { id: values.categoryId, status: "ACTIVE" },
            select: { id: true },
          });
          if (!category) throw new MasterDataError("INVALID_INPUT", "Category must be active");
        }

        const item = await transaction.item.update({
          where: { id: itemId },
          data: {
            ...(values.name !== undefined ? { name: values.name } : {}),
            ...(values.description !== undefined ? { description: values.description } : {}),
            ...(values.categoryId !== undefined ? { categoryId: values.categoryId } : {}),
            ...(values.standardMaterialCost !== undefined
              ? { standardMaterialCost: values.standardMaterialCost === null ? null : toDecimal(values.standardMaterialCost) }
              : {}),
            ...(values.reorderPoint !== undefined ? { reorderPoint: new Prisma.Decimal(values.reorderPoint) } : {}),
            ...(values.safetyStock !== undefined ? { safetyStock: new Prisma.Decimal(values.safetyStock) } : {}),
            ...(values.purchasingLeadDays !== undefined ? { purchasingLeadDays: values.purchasingLeadDays } : {}),
            ...(values.minimumOrderQty !== undefined ? { minimumOrderQty: new Prisma.Decimal(values.minimumOrderQty) } : {}),
            ...(values.lotSizeMultiple !== undefined ? { lotSizeMultiple: new Prisma.Decimal(values.lotSizeMultiple) } : {}),
            ...(values.status !== undefined ? { status: values.status } : {}),
          },
          include: { category: true, baseUom: true },
        });

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [key, val] of Object.entries(values)) {
          const fromVal = (existing as Record<string, unknown>)[key];
          if (fromVal !== val) {
            changes[key] = { from: fromVal, to: val };
          }
        }

        await transaction.auditLog.create({
          data: {
            actorId,
            action: "item.updated",
            entityType: "Item",
            entityId: item.id,
            source: "master-data",
            metadata: {
              sku: item.sku,
              changes: changes as Record<string, unknown>,
              updatedFields: Object.keys(values),
            } as Prisma.InputJsonValue,
          },
        });

        return item;
      });
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new MasterDataError("NOT_FOUND", "Item not found");
      }
      throw error;
    }
  }

  async getItemDetail(itemId: string) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        category: true,
        baseUom: true,
        stockBalances: {
          include: {
            warehouse: { select: { id: true, code: true, name: true } },
          },
          orderBy: { warehouse: { code: "asc" } },
        },
        bomOutputs: {
          select: {
            id: true,
            number: true,
            revision: true,
            status: true,
            effectiveDate: true,
            outputQty: true,
          },
          orderBy: [{ revision: "desc" }],
        },
        bomComponents: {
          include: {
            bom: {
              select: {
                id: true,
                number: true,
                revision: true,
                status: true,
                outputItem: { select: { id: true, sku: true, name: true } },
              },
            },
            uom: { select: { code: true } },
          },
          orderBy: [{ sequence: "asc" }],
        },
      },
    });

    if (!item) {
      throw new MasterDataError("NOT_FOUND", "Item not found");
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: "Item",
        entityId: itemId,
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      item,
      auditLogs,
    };
  }
}

export const itemReadPermission: Permission = "item.read";
