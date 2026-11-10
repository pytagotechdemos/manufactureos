import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateActualManufacturingCost, calculateEstimatedManufacturingCost, type ActualLaborEntry, type ActualMaterialIssue } from "@/modules/costing/domain/manufacturing-cost";
import { InventoryService } from "@/modules/inventory/application/inventory-service";

export class CostingApplicationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_STATE", message: string) {
    super(message);
    this.name = "CostingApplicationError";
  }
}

function money(value: string) { return new Prisma.Decimal(value); }

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

export class ManufacturingCostService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly inventory: InventoryService = new InventoryService(prisma),
  ) {}

  async createEstimate(actorId: string, manufacturingOrderId: string) {
    const order = await this.prisma.manufacturingOrder.findUnique({
      where: { id: manufacturingOrderId },
      include: { materials: { include: { item: { select: { standardMaterialCost: true } } } }, workOrders: { include: { workCenter: { select: { hourlyRate: true } } } } },
    });
    if (!order) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    if (order.status === "CANCELLED") throw new CostingApplicationError("INVALID_STATE", "Cannot estimate cost for a cancelled manufacturing order");
    const standardCosts = new Map(order.materials.map((material) => [material.itemId, material.item.standardMaterialCost?.toString() ?? null]));
    const estimate = calculateEstimatedManufacturingCost({
      materials: order.materials.map((material) => ({ itemId: material.itemId, quantity: material.plannedQty.toString() })),
      standardMaterialCosts: standardCosts,
      operations: order.workOrders
        .filter((workOrder) => workOrder.standardMinutes.greaterThan(0))
        .map((workOrder) => ({ operationCode: workOrder.operationCode, standardMinutes: workOrder.standardMinutes.toString(), hourlyRate: workOrder.workCenter?.hourlyRate.toString() ?? null })),
      plannedOverhead: "0",
    });
    const costPerAcceptedUnit = order.quantity.isZero()
      ? null
      : new Decimal(estimate.totalCost).div(new Decimal(order.quantity.toString())).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString();
    return this.prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.manufacturingCostSnapshot.create({
        data: {
          manufacturingOrderId: order.id,
          type: "ESTIMATE",
          materialCost: money(estimate.materialCost),
          laborCost: money(estimate.laborCost),
          overheadCost: money(estimate.overheadCost),
          totalCost: money(estimate.totalCost),
          wipCost: money("0"),
          completedCost: money(estimate.totalCost),
          costPerAcceptedUnit: costPerAcceptedUnit === null ? null : money(costPerAcceptedUnit),
          valuationComplete: estimate.missingStandardCostItemIds.length === 0 && estimate.missingStandardOperationCodes.length === 0,
          unvaluedReferences: { missingStandardCostItemIds: estimate.missingStandardCostItemIds, missingStandardOperationCodes: estimate.missingStandardOperationCodes },
          inputSnapshot: { materialQtys: order.materials.map((material) => ({ itemId: material.itemId, quantity: material.plannedQty.toString() })), standardCosts: Object.fromEntries(standardCosts), operations: order.workOrders.map((workOrder) => ({ operationCode: workOrder.operationCode, standardMinutes: workOrder.standardMinutes.toString(), hourlyRate: workOrder.workCenter?.hourlyRate.toString() ?? null })), plannedOverhead: "0" },
          createdById: actorId,
        },
      });
      await transaction.auditLog.create({ data: { actorId, action: "manufacturing_cost.estimate.created", entityType: "ManufacturingOrder", entityId: order.id, source: "costing", metadata: { snapshotId: snapshot.id, totalCost: snapshot.totalCost.toString(), valuationComplete: snapshot.valuationComplete } } });
      return snapshot;
    });
  }

  async createActual(actorId: string, manufacturingOrderId: string) {
    const order = await this.prisma.manufacturingOrder.findUnique({ where: { id: manufacturingOrderId }, include: { workOrders: { include: { timeEntries: true } } } });
    if (!order) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    if (order.status !== "COMPLETED") throw new CostingApplicationError("INVALID_STATE", "Actual cost can only be finalized after the manufacturing order is completed");
    if (!order.producedQuantity.greaterThan(0)) throw new CostingApplicationError("INVALID_STATE", "Actual cost requires posted production output");
    const movements = await this.prisma.stockMovement.findMany({
      where: { sourceType: "MANUFACTURING_ORDER", sourceId: { startsWith: `${order.id}:` }, movementType: "CONSUMPTION" },
      select: { id: true, quantity: true, unitCost: true, costStatus: true },
    });
    const laborEntries = order.workOrders.flatMap((workOrder) => workOrder.timeEntries.map((entry) => ({ id: entry.id, minutes: entry.minutes, hourlyRate: entry.hourlyRate })));
    const actual = calculateActualManufacturingCost({
      materialIssues: movements.map((movement): ActualMaterialIssue => ({ movementId: movement.id, quantity: movement.quantity.toString(), unitCost: movement.costStatus === "VALUED" ? movement.unitCost?.toString() ?? null : null })),
      laborEntries: laborEntries.map((entry): ActualLaborEntry => ({ entryId: entry.id, minutes: entry.minutes.toString(), hourlyRate: entry.hourlyRate.toString() })),
      overheadCost: "0",
      targetQuantity: order.quantity.toString(),
      producedQuantity: order.producedQuantity.toString(),
      acceptedQuantity: order.acceptedQuantity.toString(),
    });
    return serializable(this.prisma, async (transaction) => {
      const existing = await transaction.manufacturingCostSnapshot.findFirst({ where: { manufacturingOrderId: order.id, type: "ACTUAL" }, orderBy: { createdAt: "desc" } });
      if (existing) return existing;
      const currentOrder = await transaction.manufacturingOrder.findUnique({ where: { id: order.id }, select: { status: true, producedQuantity: true, acceptedQuantity: true } });
      if (!currentOrder || currentOrder.status !== "COMPLETED" || !currentOrder.producedQuantity.equals(order.producedQuantity) || !currentOrder.acceptedQuantity.equals(order.acceptedQuantity)) throw new CostingApplicationError("INVALID_STATE", "Manufacturing order changed while actual cost was being calculated");
      const snapshot = await transaction.manufacturingCostSnapshot.create({
        data: {
          manufacturingOrderId: order.id,
          type: "ACTUAL",
          materialCost: money(actual.valuedMaterialCost),
          laborCost: money(actual.valuedLaborCost),
          overheadCost: money(actual.overheadCost),
          totalCost: money(actual.knownAccumulatedCost),
          wipCost: money(actual.wipCost),
          completedCost: money(actual.completedCost),
          costPerAcceptedUnit: actual.costPerAcceptedUnit === null ? null : money(actual.costPerAcceptedUnit),
          valuationComplete: actual.valuationComplete,
          unvaluedReferences: { materialMovementIds: actual.unvaluedMovementIds, laborEntryIds: actual.unvaluedLaborEntryIds },
          inputSnapshot: { materialIssues: movements.map((movement) => ({ id: movement.id, quantity: movement.quantity.toString(), unitCost: movement.costStatus === "VALUED" ? movement.unitCost?.toString() ?? null : null })), laborEntries: laborEntries.map((entry) => ({ id: entry.id, minutes: entry.minutes.toString(), hourlyRate: entry.hourlyRate.toString() })), overheadCost: "0", targetQuantity: order.quantity.toString(), producedQuantity: order.producedQuantity.toString(), acceptedQuantity: order.acceptedQuantity.toString() },
          createdById: actorId,
        },
      });
      await transaction.auditLog.create({ data: { actorId, action: "manufacturing_cost.actual.created", entityType: "ManufacturingOrder", entityId: order.id, source: "costing", metadata: { snapshotId: snapshot.id, totalCost: snapshot.totalCost.toString(), wipCost: snapshot.wipCost.toString(), valuationComplete: snapshot.valuationComplete } } });
      if (actual.valuationComplete && actual.costPerAcceptedUnit) {
        await this.inventory.revalueProductionReceipts(transaction, {
          actorId,
          manufacturingOrderId: order.id,
          costPerUnit: actual.costPerAcceptedUnit,
        });
      }
      return snapshot;
    });
  }

  async list(manufacturingOrderId: string) {
    const exists = await this.prisma.manufacturingOrder.findUnique({ where: { id: manufacturingOrderId }, select: { id: true } });
    if (!exists) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    return this.prisma.manufacturingCostSnapshot.findMany({ where: { manufacturingOrderId }, orderBy: { createdAt: "desc" } });
  }

  async getCostReport(filters?: { startDate?: string; endDate?: string; status?: string }) {
    const where: Prisma.ManufacturingOrderWhereInput = {};
    if (filters?.status && filters.status !== "ALL") {
      where.status = filters.status as Prisma.EnumManufacturingOrderStatusFilter;
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const orders = await this.prisma.manufacturingOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        quantity: true,
        producedQuantity: true,
        acceptedQuantity: true,
        createdAt: true,
        item: { select: { sku: true, name: true } },
        costSnapshots: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            materialCost: true,
            laborCost: true,
            overheadCost: true,
            totalCost: true,
            wipCost: true,
            completedCost: true,
            costPerAcceptedUnit: true,
            valuationComplete: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return orders.map((order) => {
      const estimate = order.costSnapshots.find((s) => s.type === "ESTIMATE");
      const actual = order.costSnapshots.find((s) => s.type === "ACTUAL");
      const estimatedCost = estimate ? Number(estimate.totalCost) : null;
      const actualCost = actual ? Number(actual.totalCost) : null;
      const estimatedMaterialCost = estimate ? Number(estimate.materialCost) : null;
      const actualMaterialCost = actual ? Number(actual.materialCost) : null;
      const estimatedLaborCost = estimate ? Number(estimate.laborCost) : null;
      const actualLaborCost = actual ? Number(actual.laborCost) : null;
      const estimatedOverheadCost = estimate ? Number(estimate.overheadCost) : null;
      const actualOverheadCost = actual ? Number(actual.overheadCost) : null;

      return {
        moId: order.id,
        moNumber: order.number,
        itemSku: order.item?.sku ?? "—",
        itemName: order.item?.name ?? "—",
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        quantity: order.quantity.toString(),
        producedQuantity: order.producedQuantity.toString(),
        acceptedQuantity: order.acceptedQuantity.toString(),
        estimatedCost,
        actualCost,
        estimatedMaterialCost,
        actualMaterialCost,
        estimatedLaborCost,
        actualLaborCost,
        estimatedOverheadCost,
        actualOverheadCost,
        costPerAcceptedUnit: actual?.costPerAcceptedUnit?.toString() ?? estimate?.costPerAcceptedUnit?.toString() ?? null,
        actualValuationComplete: actual?.valuationComplete ?? false,
        wipCost: actual ? Number(actual.wipCost) : 0,
        variance: estimatedCost !== null && actualCost !== null ? new Decimal(actualCost).minus(estimatedCost).toNumber() : null,
        materialVariance: estimatedMaterialCost !== null && actualMaterialCost !== null ? new Decimal(actualMaterialCost).minus(estimatedMaterialCost).toNumber() : null,
        laborVariance: estimatedLaborCost !== null && actualLaborCost !== null ? new Decimal(actualLaborCost).minus(estimatedLaborCost).toNumber() : null,
        overheadVariance: estimatedOverheadCost !== null && actualOverheadCost !== null ? new Decimal(actualOverheadCost).minus(estimatedOverheadCost).toNumber() : null,
      };
    });
  }
}
