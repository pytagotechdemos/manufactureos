import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
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
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    return this.prisma.$transaction(async (transaction) => {
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

  async listDemands(input: unknown) {
    const parsed = demandListSchema.safeParse(input);
    if (!parsed.success) throw new PlanningError("INVALID_INPUT", parsed.error.message);
    const { status, limit, offset } = parsed.data;
    const where: Prisma.ProductionDemandWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.productionDemand.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: "desc" }, include: { lines: { include: { item: { select: { id: true, sku: true, name: true } } } } } }),
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

    return serializable(this.prisma, async (transaction) => {
      const demands = await transaction.productionDemandLine.findMany({
        where: { demand: { status: "RELEASED", ...(demandIds ? { id: { in: demandIds } } : {}) }, requiredDate: { lte: horizonEnd } },
        include: { demand: true },
        orderBy: [{ requiredDate: "asc" }, { demandId: "asc" }],
      });
      const [items, boms, balances, poLines] = await Promise.all([
        transaction.item.findMany({ where: { status: "ACTIVE" }, select: { id: true, supplyType: true, safetyStock: true, purchasingLeadDays: true, minimumOrderQty: true, lotSizeMultiple: true, itemType: true, baseUom: { select: { precision: true } } } }),
        transaction.bom.findMany({ where: { status: "APPROVED", effectiveDate: { lte: horizonEnd } }, include: { lines: { include: { component: { select: { supplyType: true } } } } }, orderBy: [{ outputItemId: "asc" }, { effectiveDate: "desc" }] }),
        transaction.stockBalance.findMany({ select: { itemId: true, onHand: true, reserved: true, blocked: true } }),
        transaction.purchaseOrderLine.findMany({
          where: { order: { status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] }, expectedDelivery: { lte: horizonEnd } } },
          include: { order: { select: { id: true, expectedDelivery: true } } },
        }),
      ]);

      const availableStock = new Map<string, string>();
      for (const balance of balances) {
        const available = balance.onHand.minus(balance.blocked).minus(balance.reserved);
        availableStock.set(balance.itemId, (new Prisma.Decimal(availableStock.get(balance.itemId) ?? "0")).plus(available).toString());
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
          lines: bom.lines.map((line) => ({ componentItemId: line.componentId, quantityPerOutput: line.quantity.toString(), scrapRate: line.scrapRate.toString() })),
        } satisfies MrpBom)),
        demands: demands.map((line) => ({ demandId: line.id, itemId: line.itemId, quantity: line.quantity.toString(), requiredDate: line.requiredDate.toISOString() })),
        availableStock,
        confirmedSupply: poLines.flatMap((line) => {
          const remaining = line.orderedQty.minus(line.receivedQty);
          if (!line.order.expectedDelivery || !remaining.greaterThan(0)) return [];
          return [{ supplyId: line.id, itemId: line.itemId, quantity: remaining.toString(), availableDate: line.order.expectedDelivery.toISOString(), supplyType: "PURCHASE_ORDER" as const }];
        }),
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
      for (const bucket of result.buckets) {
        const saved = await transaction.mrpBucket.create({
          data: {
            runId: run.id,
            itemId: bucket.itemId,
            bucketDate: new Date(`${bucket.date}T00:00:00.000Z`),
            grossRequirements: decimal(bucket.grossRequirements),
            scheduledReceipts: decimal(bucket.scheduledReceipts),
            projectedAvailable: decimal(bucket.projectedAvailable),
            netRequirements: decimal(bucket.netRequirements),
          },
        });
        bucketsByKey.set(`${bucket.itemId}:${bucket.date}`, saved.id);
      }
      for (const recommendation of result.recommendations) {
        const saved = await transaction.mrpRecommendation.create({
          data: {
            runId: run.id,
            bucketId: bucketsByKey.get(`${recommendation.itemId}:${recommendation.requiredDate}`),
            itemId: recommendation.itemId,
            supplyType: recommendation.supplyType,
            quantity: decimal(recommendation.quantity),
            requiredDate: new Date(`${recommendation.requiredDate}T00:00:00.000Z`),
            plannedReleaseDate: new Date(`${recommendation.plannedReleaseDate}T00:00:00.000Z`),
            late: recommendation.late,
            sources: { create: recommendation.sourceDemandIds.map((demandLineId) => ({ demandLineId })) },
          },
        });
        void saved;
      }
      await transaction.auditLog.create({ data: { actorId, action: "mrp.run.completed", entityType: "MrpRun", entityId: run.id, source: "planning", metadata: { runNumber, bucketCount: result.buckets.length, recommendationCount: result.recommendations.length } } });
      return this.getMrpRun(run.id, transaction);
    });
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
