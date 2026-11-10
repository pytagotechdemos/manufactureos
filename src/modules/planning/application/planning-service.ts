import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { normalizeToBaseUom } from "@/modules/engineering/domain/uom-conversion";
import { calculateMrp, MrpError, type MrpBom, type MrpInput, type MrpResult } from "@/modules/planning/domain/mrp-engine";
import { demandListSchema, mrpRunSchema, productionDemandCreateSchema } from "./planning-validation";

export class PlanningError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" | "MRP_ERROR", message: string) {
    super(message);
    this.name = "PlanningError";
  }
}

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

async function serializable<T>(prisma: PrismaClient, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

function mapMrpError(error: unknown): never {
  if (error instanceof MrpError) throw new PlanningError("MRP_ERROR", error.message);
  throw error;
}

export class PlanningService {
  constructor(private readonly prisma: PrismaClient) {}

  async masterData() {
    return this.prisma.item.findMany({ where: { status: "ACTIVE" }, select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } }, orderBy: { sku: "asc" } });
  }

  async createDemand(actorId: string, input: unknown) {
    const parsed = productionDemandCreateSchema.safeParse(input);
    if (!parsed.success) throw new PlanningError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const itemIds = [...new Set(value.lines.map((line) => line.itemId))];
        const itemCount = await transaction.item.count({ where: { id: { in: itemIds }, status: "ACTIVE" } });
        if (itemCount !== itemIds.length) throw new PlanningError("INVALID_INPUT", "All demand items must be active");
        const demand = await transaction.productionDemand.create({
          data: {
            number: value.number,
            requestedById: actorId,
            requiredDate: value.lines.reduce((earliest, line) => line.requiredDate < earliest ? line.requiredDate : earliest, value.lines[0]!.requiredDate),
            lines: { create: value.lines.map((line) => ({ itemId: line.itemId, quantity: decimal(line.quantity), requiredDate: line.requiredDate })) },
          },
          include: { lines: true },
        });
        await transaction.auditLog.create({ data: { actorId, action: "production_demand.created", entityType: "ProductionDemand", entityId: demand.id, source: "planning", metadata: { number: demand.number, lineCount: demand.lines.length } } });
        return demand;
      });
    } catch (error) {
      if (error instanceof PlanningError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new PlanningError("CONFLICT", "Production demand number already exists");
      }
      throw error;
    }
  }

  async releaseDemand(actorId: string, demandId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const demand = await transaction.productionDemand.findUnique({ where: { id: demandId }, include: { lines: true } });
      if (!demand) throw new PlanningError("NOT_FOUND", "Production demand not found");
      if (demand.status !== "DRAFT") throw new PlanningError("INVALID_STATE", "Only draft demand can be released");
      const result = await transaction.productionDemand.updateMany({ where: { id: demandId, status: "DRAFT" }, data: { status: "RELEASED" } });
      if (result.count !== 1) throw new PlanningError("CONFLICT", "Demand state changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: "production_demand.released", entityType: "ProductionDemand", entityId: demandId, source: "planning", metadata: { number: demand.number } } });
      return transaction.productionDemand.findUniqueOrThrow({ where: { id: demandId }, include: { lines: true } });
    });
  }

  async cancelDemand(actorId: string, demandId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const demand = await transaction.productionDemand.findUnique({ where: { id: demandId }, include: { lines: true } });
      if (!demand) throw new PlanningError("NOT_FOUND", "Production demand not found");
      if (demand.status !== "DRAFT" && demand.status !== "RELEASED") {
        throw new PlanningError("INVALID_STATE", "Only draft or released demand can be cancelled");
      }
      const updated = await transaction.productionDemand.update({
        where: { id: demandId },
        data: { status: "CANCELLED" },
        include: { lines: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "production_demand.cancelled",
          entityType: "ProductionDemand",
          entityId: demandId,
          source: "planning",
          metadata: { number: demand.number },
        },
      });
      return updated;
    });
  }

  async listDemands(input: unknown) {
    const parsed = demandListSchema.safeParse(input);
    if (!parsed.success) throw new PlanningError("INVALID_INPUT", parsed.error.message);
    const { status, limit, offset } = parsed.data;
    const where: Prisma.ProductionDemandWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.productionDemand.findMany({ where, take: limit, skip: offset, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { lines: { include: { item: { select: { id: true, sku: true, name: true } } } } } }),
      this.prisma.productionDemand.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async runMrp(actorId: string, input: unknown) {
    const parsed = mrpRunSchema.safeParse(input);
    if (!parsed.success) throw new PlanningError("INVALID_INPUT", parsed.error.message);
    const { runNumber, asOfDate, horizonDays, demandIds } = parsed.data;
    const horizonEnd = new Date(asOfDate);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);

    try {
      return await serializable(this.prisma, async (transaction) => {
      const demands = await transaction.productionDemandLine.findMany({
        where: { demand: { status: "RELEASED", ...(demandIds ? { id: { in: demandIds } } : {}) }, requiredDate: { lte: horizonEnd } },
        include: { demand: true },
        orderBy: [{ requiredDate: "asc" }, { demandId: "asc" }],
      });
      const [items, boms, balances, poLines, conversions, manufacturingOrders] = await Promise.all([
        transaction.item.findMany({ where: { status: "ACTIVE" }, select: { id: true, supplyType: true, safetyStock: true, purchasingLeadDays: true, minimumOrderQty: true, lotSizeMultiple: true, itemType: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
        transaction.bom.findMany({ where: { status: "APPROVED", effectiveDate: { lte: horizonEnd } }, include: { lines: { include: { uom: { select: { code: true, dimension: true, precision: true } }, component: { select: { supplyType: true, baseUom: { select: { code: true, dimension: true, precision: true } } } } } } }, orderBy: [{ outputItemId: "asc" }, { effectiveDate: "desc" }] }),
        transaction.stockBalance.findMany({ where: { warehouse: { isWip: false } }, select: { itemId: true, warehouseId: true, onHand: true, reserved: true, blocked: true } }),
        transaction.purchaseOrderLine.findMany({
          where: { order: { status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] }, expectedDelivery: { lte: horizonEnd } } },
          include: {
            order: { select: { id: true, expectedDelivery: true, warehouseId: true } },
            item: { select: { baseUom: { select: { code: true, dimension: true, precision: true } } } },
            uom: { select: { code: true, dimension: true, precision: true } },
          },
        }),
        transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
        transaction.manufacturingOrder.findMany({
          where: { status: { in: ["RELEASED", "IN_PROGRESS", "QC_PENDING"] }, plannedEnd: { lte: horizonEnd } },
          select: { id: true, itemId: true, quantity: true, completedQuantity: true, plannedEnd: true },
        }),
      ]);

      const itemById = new Map(items.map((item) => [item.id, item]));
      const conversionsByDimension = new Map<string, Array<{ from: string; to: string; factor: string }>>();
      for (const conversion of conversions) {
        if (conversion.fromUom.dimension !== conversion.toUom.dimension) continue;
        const entries = conversionsByDimension.get(conversion.fromUom.dimension) ?? [];
        entries.push({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString() });
        conversionsByDimension.set(conversion.fromUom.dimension, entries);
      }
      const stockByItemWarehouse = new Map<string, Prisma.Decimal>();
      for (const balance of balances) {
        const item = itemById.get(balance.itemId);
        if (!item) continue;
        const available = Prisma.Decimal.max(new Prisma.Decimal(0), balance.onHand.minus(balance.blocked).minus(balance.reserved));
        const current = stockByItemWarehouse.get(`${balance.itemId}:${balance.warehouseId}`) ?? new Prisma.Decimal(0);
        stockByItemWarehouse.set(`${balance.itemId}:${balance.warehouseId}`, current.plus(available));
      }
      const availableStock = new Map<string, string>();
      for (const [key, quantity] of stockByItemWarehouse) {
        const separator = key.indexOf(":");
        const itemId = key.slice(0, separator);
        availableStock.set(itemId, (new Prisma.Decimal(availableStock.get(itemId) ?? "0")).plus(quantity).toString());
      }

      const engineInput: MrpInput = {
        asOfDate: asOfDate.toISOString(),
        items: items.map((item) => ({
          itemId: item.id,
          supplyType: item.supplyType,
          safetyStock: item.safetyStock.toString(),
          leadTimeDays: item.purchasingLeadDays,
          minimumOrderQty: item.minimumOrderQty.toString(),
          lotSizeMultiple: item.lotSizeMultiple.toString(),
          discrete: item.itemType !== "RAW_MATERIAL" && item.itemType !== "CONSUMABLE",
        })),
        boms: boms.filter((bom) => bom.effectiveDate).map((bom) => ({
          outputItemId: bom.outputItemId,
          outputQuantity: bom.outputQty.toString(),
          effectiveDate: bom.effectiveDate!.toISOString(),
          lines: bom.lines.map((line) => {
            const conversionsForDimension = conversionsByDimension.get(line.uom.dimension) ?? [];
            let quantityPerOutput: string;
            try {
              quantityPerOutput = normalizeToBaseUom(
                line.quantity.toString(),
                line.uom.code,
                line.component.baseUom.code,
                [line.uom, line.component.baseUom],
                conversionsForDimension,
              );
            } catch (error) {
              throw new PlanningError("INVALID_INPUT", error instanceof Error ? error.message : "BOM component UOM is not convertible to item base UOM");
            }
            if (!new Prisma.Decimal(quantityPerOutput).greaterThan(0)) {
              throw new PlanningError("INVALID_INPUT", `BOM line for component ${line.componentId} rounds to zero in base UOM`);
            }
            return { componentItemId: line.componentId, quantityPerOutput, scrapRate: line.scrapRate.toString() };
          }),
        } satisfies MrpBom)),
        demands: demands.map((line) => ({ demandId: line.id, itemId: line.itemId, quantity: line.quantity.toString(), requiredDate: line.requiredDate.toISOString() })),
        availableStock,
        confirmedSupply: [
          ...poLines.flatMap((line) => {
            const remaining = line.orderedQty.minus(line.receivedQty);
            if (!line.order.expectedDelivery || !remaining.greaterThan(0)) return [];
            const conversionsForDimension = conversionsByDimension.get(line.uom.dimension) ?? [];
            let baseQuantity: string;
            try {
              baseQuantity = normalizeToBaseUom(
                remaining.toString(),
                line.uom.code,
                line.item.baseUom.code,
                [line.uom, line.item.baseUom],
                conversionsForDimension,
              );
            } catch (error) {
              throw new PlanningError("INVALID_INPUT", error instanceof Error ? error.message : "Purchase order supply UOM is not convertible to item base UOM");
            }
            if (!new Prisma.Decimal(baseQuantity).greaterThan(0)) {
              throw new PlanningError("INVALID_INPUT", `Purchase order line ${line.id} quantity rounds to zero in base UOM`);
            }
            return [{ supplyId: line.id, itemId: line.itemId, quantity: baseQuantity, availableDate: line.order.expectedDelivery.toISOString(), supplyType: "PURCHASE_ORDER" as const }];
          }),
          ...manufacturingOrders.flatMap((order) => {
            const remaining = order.quantity.minus(order.completedQuantity);
            if (!order.plannedEnd || !remaining.greaterThan(0)) return [];
            return [{ supplyId: order.id, itemId: order.itemId, quantity: remaining.toString(), availableDate: order.plannedEnd.toISOString(), supplyType: "MANUFACTURING_ORDER" as const }];
          }),
        ],
      };

      let result: MrpResult;
      try {
        result = calculateMrp(engineInput);
      } catch (error) {
        mapMrpError(error);
      }
      const run = await transaction.mrpRun.create({
        data: {
          runNumber,
          asOfDate,
          createdById: actorId,
          inputSnapshot: {
            asOfDate: engineInput.asOfDate,
            horizonDays,
            selectedDemandIds: demandIds ?? null,
            items: engineInput.items,
            boms: engineInput.boms,
            demands: engineInput.demands,
            availableStock: Object.fromEntries(engineInput.availableStock),
            confirmedSupply: engineInput.confirmedSupply,
          } as Prisma.InputJsonValue,
        },
      });
      const bucketsByKey = new Map<string, string>();
      const bucketRows = result.buckets.map((bucket) => ({
        id: crypto.randomUUID(),
        runId: run.id,
        itemId: bucket.itemId,
        bucketDate: new Date(`${bucket.date}T00:00:00.000Z`),
        grossRequirements: decimal(bucket.grossRequirements),
        scheduledReceipts: decimal(bucket.scheduledReceipts),
        projectedAvailable: decimal(bucket.projectedAvailable),
        netRequirements: decimal(bucket.netRequirements),
      }));
      if (bucketRows.length > 0) await transaction.mrpBucket.createMany({ data: bucketRows });
      result.buckets.forEach((bucket, index) => {
        bucketsByKey.set(`${bucket.itemId}:${bucket.date}`, bucketRows[index]!.id);
      });

      const recommendationRows = result.recommendations.map((recommendation) => ({
        id: crypto.randomUUID(),
        runId: run.id,
        bucketId: bucketsByKey.get(`${recommendation.itemId}:${recommendation.requiredDate}`) ?? null,
        itemId: recommendation.itemId,
        supplyType: recommendation.supplyType,
        quantity: decimal(recommendation.quantity),
        requiredDate: new Date(`${recommendation.requiredDate}T00:00:00.000Z`),
        plannedReleaseDate: new Date(`${recommendation.plannedReleaseDate}T00:00:00.000Z`),
        late: recommendation.late,
      }));
      if (recommendationRows.length > 0) await transaction.mrpRecommendation.createMany({ data: recommendationRows });
      const sourceRows = result.recommendations.flatMap((recommendation, index) =>
        [...new Set(recommendation.sourceDemandIds)].map((demandLineId) => ({
          recommendationId: recommendationRows[index]!.id,
          demandLineId,
        })),
      );
      if (sourceRows.length > 0) await transaction.mrpRecommendationSource.createMany({ data: sourceRows });
      await transaction.auditLog.create({ data: { actorId, action: "mrp.run.completed", entityType: "MrpRun", entityId: run.id, source: "planning", metadata: { runNumber, bucketCount: result.buckets.length, recommendationCount: result.recommendations.length } } });
      return this.getMrpRun(run.id, transaction);
    });
    } catch (error) {
      if (error instanceof PlanningError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new PlanningError("CONFLICT", "MRP run number already exists");
      }
      throw error;
    }
  }

  async listMrpRuns() {
    return this.prisma.mrpRun.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { buckets: true, recommendations: true } } } });
  }

  async getMrpRun(runId: string, database: Prisma.TransactionClient | PrismaClient = this.prisma) {
    const run = await database.mrpRun.findUnique({
      where: { id: runId },
      include: {
        buckets: {
          orderBy: [{ bucketDate: "asc" }, { item: { sku: "asc" } }],
          include: { item: { select: { sku: true, name: true, baseUom: { select: { code: true } } } } },
        },
        recommendations: {
          orderBy: [{ requiredDate: "asc" }, { item: { sku: "asc" } }],
          include: {
            item: { select: { sku: true, name: true, baseUom: { select: { code: true } } } },
            sources: { include: { demandLine: { include: { demand: { select: { number: true } } } } } },
          },
        },
      },
    });
    if (!run) throw new PlanningError("NOT_FOUND", "MRP run not found");
    return run;
  }
}
