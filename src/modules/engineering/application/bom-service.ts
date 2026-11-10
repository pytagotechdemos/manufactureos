import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { assertNoBomCycle, explodeBom, type BomCatalog } from "@/modules/engineering/domain/bom-explosion";
import { BomDomainError, type BomInput } from "@/modules/engineering/domain/bom-types";
import type { BomExplosionContext } from "@/modules/engineering/domain/bom-explosion";
import { normalizeToBaseUom } from "@/modules/engineering/domain/uom-conversion";
import { bomDraftSchema, bomCloneSchema, type BomDraftInput } from "./bom-validation";
import { bomExplosionQuerySchema, bomListSchema } from "./bom-query-validation";

export class BomApplicationError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "INVALID_INPUT" | "CONFLICT" | "BOM_CYCLE" | "MISSING_CHILD_BOM" | "AMBIGUOUS_CHILD_BOM" | "UOM_CONVERSION",
    message: string,
  ) {
    super(message);
    this.name = "BomApplicationError";
  }
}

type TransactionClient = Prisma.TransactionClient;
type DatabaseClient = PrismaClient | TransactionClient;

function decimal(value: string) {
  return new Prisma.Decimal(new Decimal(value).toString());
}

async function lockEngineeringGraph(transaction: TransactionClient) {
  await transaction.$queryRaw`WITH graph_lock AS (SELECT pg_advisory_xact_lock(CAST(8123401 AS bigint))) SELECT TRUE AS locked FROM graph_lock`;
}

async function writeAudit(
  transaction: TransactionClient,
  actorId: string,
  action: string,
  bomId: string,
  metadata: Prisma.InputJsonValue,
) {
  await transaction.auditLog.create({
    data: { actorId, action, entityType: "Bom", entityId: bomId, source: "engineering", metadata },
  });
}

function mapDomainError(error: unknown): never {
  if (error instanceof BomDomainError) {
    const code = error.code === "INVALID_QUANTITY" || error.code === "INVALID_SCRAP_RATE"
      ? "INVALID_INPUT"
      : error.code;
    throw new BomApplicationError(code, error.message);
  }
  throw error;
}

async function getCatalog(database: DatabaseClient, asOf: Date): Promise<BomCatalog> {
  const boms = await database.bom.findMany({
    where: { status: "APPROVED", effectiveDate: { lte: asOf } },
    orderBy: [{ outputItemId: "asc" }, { effectiveDate: "desc" }, { createdAt: "desc" }],
    include: { lines: { select: { componentId: true, quantity: true, scrapRate: true, uom: { select: { code: true } }, component: { select: { supplyType: true } } } } },
  });

  const catalog = new Map<string, BomInput[]>();
  const effectiveDates = new Map<string, number>();
  for (const bom of boms) {
    const effectiveDate = bom.effectiveDate?.getTime();
    if (effectiveDate === undefined) continue;
    const selectedDate = effectiveDates.get(bom.outputItemId);
    if (selectedDate !== undefined) {
      if (selectedDate === effectiveDate) {
        throw new BomApplicationError("AMBIGUOUS_CHILD_BOM", `Multiple approved BOMs share the same effective date for item ${bom.outputItemId}`);
      }
      continue;
    }
    effectiveDates.set(bom.outputItemId, effectiveDate);
    const lines = bom.lines.map((line) => ({
      componentItemId: line.componentId,
      quantity: line.quantity.toString(),
      scrapRate: line.scrapRate.toString(),
      uom: line.uom.code,
      make: line.component.supplyType === "MAKE",
    }));
    const input: BomInput = {
      bomId: bom.id,
      outputItemId: bom.outputItemId,
      outputQuantity: bom.outputQty.toString(),
      lines,
    };
    catalog.set(bom.outputItemId, [...(catalog.get(bom.outputItemId) ?? []), input]);
  }
  return catalog;
}

async function getBomExplosionContext(database: DatabaseClient): Promise<BomExplosionContext> {
  const [items, uoms, conversions] = await Promise.all([
    database.item.findMany({ select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
    database.unitOfMeasure.findMany({ where: { status: "ACTIVE" }, select: { code: true, dimension: true, precision: true } }),
    database.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
  ]);
  return {
    itemUnits: new Map(items.map((item) => [item.id, {
      baseUom: item.baseUom.code,
      dimension: item.baseUom.dimension,
      precision: item.baseUom.precision,
    }])),
    uoms: new Map(uoms.map((uom) => [uom.code, uom])),
    conversions: conversions
      .filter((conversion) => conversion.fromUom.dimension === conversion.toUom.dimension)
      .map((conversion) => ({
        from: conversion.fromUom.code,
        to: conversion.toUom.code,
        factor: conversion.factor.toString(),
        dimension: conversion.fromUom.dimension,
      })),
  };
}

export class BomService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: unknown) {
    const parsed = bomListSchema.safeParse(input);
    if (!parsed.success) throw new BomApplicationError("INVALID_INPUT", parsed.error.message);
    const { outputItemId, status, search, limit, offset } = parsed.data;
    const where: Prisma.BomWhereInput = {
      ...(outputItemId ? { outputItemId } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { number: { contains: search, mode: "insensitive" } },
          { outputItem: { sku: { contains: search, mode: "insensitive" } } },
          { outputItem: { name: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.bom.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ outputItem: { sku: "asc" } }, { revision: "desc" }, { id: "asc" }],
        include: { outputItem: { select: { id: true, sku: true, name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.bom.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async get(bomId: string) {
    const bom = await this.prisma.bom.findUnique({
      where: { id: bomId },
      select: {
        id: true,
        number: true,
        revision: true,
        status: true,
        outputQty: true,
        effectiveDate: true,
        approvedAt: true,
        outputItem: { select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } } },
        lines: {
          orderBy: { sequence: "asc" },
          include: {
            component: { select: { id: true, sku: true, name: true, supplyType: true, baseUom: { select: { code: true } } } },
            uom: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!bom) throw new BomApplicationError("NOT_FOUND", "BOM not found");
    return bom;
  }

  async explosion(bomId: string, input: unknown) {
    const parsed = bomExplosionQuerySchema.safeParse(input);
    if (!parsed.success) throw new BomApplicationError("INVALID_INPUT", parsed.error.message);
    const root = await this.getBomInput(this.prisma, bomId);
    if (root.status === "OBSOLETE") throw new BomApplicationError("INVALID_STATE", "Obsolete BOMs cannot be exploded");
    const asOf = root.effectiveDate ?? new Date();
    if (root.status === "APPROVED" && root.effectiveDate && root.effectiveDate > new Date()) {
      throw new BomApplicationError("INVALID_STATE", "BOM is not yet effective");
    }

    const catalog = await getCatalog(this.prisma, asOf);
    const rootInput: BomInput = {
      bomId: root.id,
      outputItemId: root.outputItemId,
      outputQuantity: root.outputQty.toString(),
      lines: root.lines.map((line) => ({
        componentItemId: line.componentId,
        quantity: line.quantity.toString(),
        scrapRate: line.scrapRate.toString(),
        uom: line.uom.code,
        make: line.component.supplyType === "MAKE",
      })),
    };
    try {
      const result = explodeBom(rootInput, parsed.data.quantity, catalog, await getBomExplosionContext(this.prisma));
      const itemIds = Array.from(new Set(result.requirements.map((r) => r.itemId)));
      if (itemIds.length > 0) {
        const items = await this.prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, sku: true, name: true },
        });
        const itemMap = new Map(items.map((i) => [i.id, i]));
        return {
          ...result,
          requirements: result.requirements.map((req) => {
            const found = itemMap.get(req.itemId);
            return {
              ...req,
              itemSku: found?.sku,
              itemName: found?.name,
            };
          }),
        };
      }
      return result;
    } catch (error) {
      mapDomainError(error);
    }
  }

  async createDraft(actorId: string, input: unknown) {
    const parsed = bomDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new BomApplicationError("INVALID_INPUT", parsed.error.message);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockEngineeringGraph(transaction);
        await this.validateReferences(transaction, parsed.data);
        const bom = await transaction.bom.create({
          data: {
            number: parsed.data.number,
            outputItemId: parsed.data.outputItemId,
            revision: parsed.data.revision,
            outputQty: decimal(parsed.data.outputQuantity),
            effectiveDate: parsed.data.effectiveDate,
            createdById: actorId,
            lines: {
              create: parsed.data.lines.map((line, index) => ({
                componentId: line.componentItemId,
                quantity: decimal(line.quantity),
                uomId: line.uomId,
                scrapRate: decimal(line.scrapRate),
                sequence: index + 1,
                notes: line.notes,
              })),
            },
          },
          include: { lines: true },
        });
        await writeAudit(transaction, actorId, "bom.created", bom.id, { number: bom.number, revision: bom.revision });
        return bom;
      });
    } catch (error) {
      if (error instanceof BomApplicationError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BomApplicationError("CONFLICT", "BOM number or item revision already exists");
      }
      throw error;
    }
  }

  async updateDraft(actorId: string, bomId: string, input: unknown) {
    const parsed = bomDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new BomApplicationError("INVALID_INPUT", parsed.error.message);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockEngineeringGraph(transaction);
        const existing = await transaction.bom.findUnique({ where: { id: bomId } });
        if (!existing) throw new BomApplicationError("NOT_FOUND", "BOM not found");
        if (existing.status !== "DRAFT") throw new BomApplicationError("INVALID_STATE", "Only draft BOMs may be edited");
        await this.validateReferences(transaction, parsed.data);

        const bom = await transaction.bom.update({
          where: { id: bomId },
          data: {
            number: parsed.data.number,
            outputItemId: parsed.data.outputItemId,
            revision: parsed.data.revision,
            outputQty: decimal(parsed.data.outputQuantity),
            effectiveDate: parsed.data.effectiveDate,
            lines: {
              deleteMany: {},
              create: parsed.data.lines.map((line, index) => ({
                componentId: line.componentItemId,
                quantity: decimal(line.quantity),
                uomId: line.uomId,
                scrapRate: decimal(line.scrapRate),
                sequence: index + 1,
                notes: line.notes,
              })),
            },
          },
          include: { lines: true },
        });
        await writeAudit(transaction, actorId, "bom.updated", bom.id, { number: bom.number, revision: bom.revision });
        return bom;
      });
    } catch (error) {
      if (error instanceof BomApplicationError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BomApplicationError("CONFLICT", "BOM number or item revision already exists");
      }
      throw error;
    }
  }

  async submitForReview(actorId: string, bomId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await lockEngineeringGraph(transaction);
      const candidate = await this.getBomInput(transaction, bomId);
      if (candidate.status !== "DRAFT") throw new BomApplicationError("INVALID_STATE", "Only draft BOMs may enter review");
      if (candidate.lines.length === 0) throw new BomApplicationError("INVALID_INPUT", "BOM must contain at least one component");
      await this.validateOutputAndLines(transaction, candidate);
      const updated = await transaction.bom.update({ where: { id: bomId }, data: { status: "IN_REVIEW" } });
      await writeAudit(transaction, actorId, "bom.submitted_for_review", bomId, { revision: updated.revision });
      return updated;
    });
  }

  async approve(actorId: string, bomId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await lockEngineeringGraph(transaction);
      const candidate = await this.getBomInput(transaction, bomId);
      if (candidate.status !== "IN_REVIEW") throw new BomApplicationError("INVALID_STATE", "Only in-review BOMs may be approved");
      if (candidate.lines.length === 0) throw new BomApplicationError("INVALID_INPUT", "BOM must contain at least one component");
      if (!candidate.effectiveDate) throw new BomApplicationError("INVALID_INPUT", "An effective date is required before approval");
      await this.validateOutputAndLines(transaction, candidate);
      const effectiveDate = candidate.effectiveDate;
      const effectiveDateExists = await transaction.bom.findFirst({
        where: { id: { not: candidate.id }, outputItemId: candidate.outputItemId, status: "APPROVED", effectiveDate },
        select: { id: true, number: true, revision: true },
      });
      if (effectiveDateExists) throw new BomApplicationError("AMBIGUOUS_CHILD_BOM", `An approved BOM for this item already has the effective date (${effectiveDateExists.number}, revision ${effectiveDateExists.revision})`);

      const catalog = await getCatalog(transaction, effectiveDate);
      const candidateInput: BomInput = {
        bomId: candidate.id,
        outputItemId: candidate.outputItemId,
        outputQuantity: candidate.outputQty.toString(),
        lines: candidate.lines.map((line) => ({
          componentItemId: line.componentId,
          quantity: line.quantity.toString(),
          scrapRate: line.scrapRate.toString(),
          uom: line.uom.code,
          make: line.component.supplyType === "MAKE",
        })),
      };
      try {
        assertNoBomCycle(candidateInput, catalog, await getBomExplosionContext(transaction));
      } catch (error) {
        mapDomainError(error);
      }

      const approvedUpdate = await transaction.bom.updateMany({
        where: { id: bomId, status: "IN_REVIEW" },
        data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() },
      });
      if (approvedUpdate.count !== 1) throw new BomApplicationError("INVALID_STATE", "BOM is no longer in review");
      const approved = await transaction.bom.findUniqueOrThrow({ where: { id: bomId } });
      await writeAudit(transaction, actorId, "bom.approved", bomId, { revision: approved.revision });
      return approved;
    });
  }

  async obsolete(actorId: string, bomId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await lockEngineeringGraph(transaction);
      const existing = await transaction.bom.findUnique({ where: { id: bomId } });
      if (!existing) throw new BomApplicationError("NOT_FOUND", "BOM not found");
      if (existing.status !== "APPROVED") throw new BomApplicationError("INVALID_STATE", "Only approved BOMs may be obsoleted");
      const updated = await transaction.bom.update({ where: { id: bomId }, data: { status: "OBSOLETE" } });
      await writeAudit(transaction, actorId, "bom.obsoleted", bomId, { revision: updated.revision });
      return updated;
    });
  }

  async rejectToDraft(actorId: string, bomId: string, reason?: string) {
    return this.prisma.$transaction(async (transaction) => {
      await lockEngineeringGraph(transaction);
      const existing = await transaction.bom.findUnique({ where: { id: bomId } });
      if (!existing) throw new BomApplicationError("NOT_FOUND", "BOM not found");
      if (existing.status !== "IN_REVIEW") {
        throw new BomApplicationError("INVALID_STATE", "Only in-review BOMs may be returned to draft");
      }
      const updated = await transaction.bom.update({ where: { id: bomId }, data: { status: "DRAFT" } });
      await writeAudit(transaction, actorId, "bom.rejected_to_draft", bomId, { revision: updated.revision, reason: reason ?? null });
      return updated;
    });
  }

  async deleteDraft(actorId: string, bomId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await lockEngineeringGraph(transaction);
      const existing = await transaction.bom.findUnique({
        where: { id: bomId },
        select: { id: true, number: true, revision: true, status: true },
      });
      if (!existing) throw new BomApplicationError("NOT_FOUND", "BOM not found");
      if (existing.status !== "DRAFT") {
        throw new BomApplicationError("INVALID_STATE", "Only draft BOMs may be deleted");
      }
      await transaction.bom.delete({ where: { id: bomId } });
      await writeAudit(transaction, actorId, "bom.deleted", bomId, { number: existing.number, revision: existing.revision });
      return { success: true };
    });
  }

  async cloneAsDraft(actorId: string, sourceBomId: string, input: unknown) {
    const parsed = bomCloneSchema.safeParse(input);
    if (!parsed.success) {
      throw new BomApplicationError("INVALID_INPUT", parsed.error.message);
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        await lockEngineeringGraph(transaction);
        const source = await transaction.bom.findUnique({
          where: { id: sourceBomId },
          include: { lines: { orderBy: { sequence: "asc" } } },
        });
        if (!source) throw new BomApplicationError("NOT_FOUND", "BOM sumber tidak ditemukan");

        const bom = await transaction.bom.create({
          data: {
            number: parsed.data.number,
            outputItemId: source.outputItemId,
            revision: parsed.data.revision,
            outputQty: source.outputQty,
            effectiveDate: parsed.data.effectiveDate ?? null,
            createdById: actorId,
            lines: {
              create: source.lines.map((line, index) => ({
                componentId: line.componentId,
                quantity: line.quantity,
                uomId: line.uomId,
                scrapRate: line.scrapRate,
                sequence: index + 1,
                notes: line.notes,
              })),
            },
          },
          include: { lines: true },
        });

        await writeAudit(transaction, actorId, "bom.cloned", bom.id, {
          sourceBomId,
          number: bom.number,
          revision: bom.revision,
        });

        return bom;
      });
    } catch (error) {
      if (error instanceof BomApplicationError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BomApplicationError("CONFLICT", "Nomor BOM atau revisi untuk barang ini sudah ada");
      }
      throw error;
    }
  }

  private async validateReferences(transaction: TransactionClient, input: BomDraftInput) {
    const itemIds = [...new Set([input.outputItemId, ...input.lines.map((line) => line.componentItemId)])];
    const uomIds = [...new Set(input.lines.map((line) => line.uomId))];
    const [items, uoms, conversions] = await Promise.all([
      transaction.item.findMany({ where: { id: { in: itemIds }, status: "ACTIVE" }, select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
      transaction.unitOfMeasure.findMany({ where: { id: { in: uomIds }, status: "ACTIVE" }, select: { id: true, code: true, dimension: true, precision: true } }),
      transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
    ]);
    if (items.length !== itemIds.length || uoms.length !== uomIds.length) {
      throw new BomApplicationError("INVALID_INPUT", "All items and units of measure must exist and be active");
    }
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const uomsById = new Map(uoms.map((uom) => [uom.id, uom]));
    for (const line of input.lines) {
      const item = itemsById.get(line.componentItemId);
      const sourceUom = uomsById.get(line.uomId);
      if (!item || !sourceUom) throw new BomApplicationError("INVALID_INPUT", "BOM references an unknown item or UOM");
      try {
        const sameDimensionConversions = conversions
          .filter((conversion) => conversion.fromUom.dimension === sourceUom.dimension && conversion.toUom.dimension === sourceUom.dimension)
          .map((conversion) => ({
            from: conversion.fromUom.code,
            to: conversion.toUom.code,
            factor: conversion.factor.toString(),
          }));
        normalizeToBaseUom(line.quantity, sourceUom.code, item.baseUom.code, [sourceUom, item.baseUom], sameDimensionConversions);
      } catch (error) {
        throw new BomApplicationError("UOM_CONVERSION", error instanceof Error ? error.message : "UOM conversion failed");
      }
    }
  }

  private async validateOutputAndLines(transaction: TransactionClient, bom: Awaited<ReturnType<BomService["getBomInput"]>>) {
    const output = new Decimal(bom.outputQty.toString());
    if (!output.isFinite() || !output.greaterThan(0)) throw new BomApplicationError("INVALID_INPUT", "Output quantity must be positive");
    for (const line of bom.lines) {
      if (!new Decimal(line.quantity.toString()).greaterThan(0)) throw new BomApplicationError("INVALID_INPUT", "Component quantity must be positive");
      const scrap = new Decimal(line.scrapRate.toString());
      if (!scrap.greaterThanOrEqualTo(0) || !scrap.lessThan(1)) {
        throw new BomApplicationError("INVALID_INPUT", "Scrap rate must be between 0 and 0.999999");
      }
      if (line.componentId === bom.outputItemId) throw new BomApplicationError("BOM_CYCLE", "BOM output cannot be its own component");
      if (line.component.supplyType === "MAKE") {
        const child = await transaction.bom.findFirst({
          where: {
            outputItemId: line.componentId,
            status: "APPROVED",
            id: { not: bom.id },
            effectiveDate: { not: null, lte: bom.effectiveDate ?? new Date() },
          },
          orderBy: [{ effectiveDate: "desc" }, { revision: "desc" }],
          select: { id: true, effectiveDate: true },
        });
        if (!child) throw new BomApplicationError("MISSING_CHILD_BOM", `MAKE component ${line.componentId} needs an approved BOM`);
      }
    }
  }

  private async getBomInput(database: DatabaseClient, bomId: string) {
    const bom = await database.bom.findUnique({
      where: { id: bomId },
      include: {
        lines: {
          orderBy: { sequence: "asc" },
          include: { uom: { select: { code: true } }, component: { select: { supplyType: true } } },
        },
      },
    });
    if (!bom) throw new BomApplicationError("NOT_FOUND", "BOM not found");
    return bom;
  }
}
