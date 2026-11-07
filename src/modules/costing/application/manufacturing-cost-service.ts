import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { calculateActualManufacturingCost, calculateEstimatedManufacturingCost, type ActualLaborEntry, type ActualMaterialIssue } from "@/modules/costing/domain/manufacturing-cost";

export class CostingApplicationError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID_STATE", message: string) {
    super(message);
    this.name = "CostingApplicationError";
  }
}

function money(value: string) { return new Prisma.Decimal(value); }

export class ManufacturingCostService {
  constructor(private readonly prisma: PrismaClient) {}

  async createEstimate(actorId: string, manufacturingOrderId: string) {
    const order = await this.prisma.manufacturingOrder.findUnique({
      where: { id: manufacturingOrderId },
      include: { materials: { include: { item: { select: { standardMaterialCost: true } } } }, workOrders: { include: { workCenter: { select: { hourlyRate: true } } } } },
    });
    if (!order) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    const standardCosts = new Map(order.materials.map((material) => [material.itemId, material.item.standardMaterialCost?.toString() ?? null]));
    const estimate = calculateEstimatedManufacturingCost({
      materials: order.materials.map((material) => ({ itemId: material.itemId, quantity: material.plannedQty.toString() })),
      standardMaterialCosts: standardCosts,
      operations: order.workOrders
        .filter((workOrder) => workOrder.standardMinutes.greaterThan(0))
        .map((workOrder) => ({ operationCode: workOrder.operationCode, standardMinutes: workOrder.standardMinutes.toString(), hourlyRate: workOrder.workCenter?.hourlyRate.toString() ?? null })),
      plannedOverhead: "0",
    });
    const snapshot = await this.prisma.manufacturingCostSnapshot.create({
      data: {
        manufacturingOrderId: order.id,
        type: "ESTIMATE",
        materialCost: money(estimate.materialCost),
        laborCost: money(estimate.laborCost),
        overheadCost: money(estimate.overheadCost),
        totalCost: money(estimate.totalCost),
        wipCost: money("0"),
        completedCost: money(estimate.totalCost),
        costPerAcceptedUnit: order.quantity.isZero() ? null : money(estimate.totalCost).div(order.quantity),
        valuationComplete: estimate.missingStandardCostItemIds.length === 0 && estimate.missingStandardOperationCodes.length === 0,
        unvaluedReferences: { missingStandardCostItemIds: estimate.missingStandardCostItemIds, missingStandardOperationCodes: estimate.missingStandardOperationCodes },
        inputSnapshot: { materialQtys: order.materials.map((material) => ({ itemId: material.itemId, quantity: material.plannedQty.toString() })), standardCosts: Object.fromEntries(standardCosts), operations: order.workOrders.map((workOrder) => ({ operationCode: workOrder.operationCode, standardMinutes: workOrder.standardMinutes.toString(), hourlyRate: workOrder.workCenter?.hourlyRate.toString() ?? null })), plannedOverhead: "0" },
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "manufacturing_cost.estimate.created", entityType: "ManufacturingOrder", entityId: order.id, source: "costing", metadata: { snapshotId: snapshot.id, totalCost: snapshot.totalCost.toString(), valuationComplete: snapshot.valuationComplete } } });
    return snapshot;
  }

  async createActual(actorId: string, manufacturingOrderId: string) {
    const order = await this.prisma.manufacturingOrder.findUnique({ where: { id: manufacturingOrderId }, include: { workOrders: { include: { timeEntries: true } } } });
    if (!order) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    const movements = await this.prisma.stockMovement.findMany({
      where: { sourceType: "MANUFACTURING_ORDER", sourceId: { startsWith: `${order.id}:` }, movementType: "CONSUMPTION" },
      select: { id: true, quantity: true, unitCost: true },
    });
    const laborEntries = order.workOrders.flatMap((workOrder) => workOrder.timeEntries.map((entry) => ({ id: entry.id, minutes: entry.minutes, hourlyRate: entry.hourlyRate })));
    const actual = calculateActualManufacturingCost({
      materialIssues: movements.map((movement): ActualMaterialIssue => ({ movementId: movement.id, quantity: movement.quantity.toString(), unitCost: movement.unitCost?.toString() ?? null })),
      laborEntries: laborEntries.map((entry): ActualLaborEntry => ({ entryId: entry.id, minutes: entry.minutes.toString(), hourlyRate: entry.hourlyRate.toString() })),
      overheadCost: "0",
      targetQuantity: order.quantity.toString(),
      producedQuantity: order.producedQuantity.toString(),
      acceptedQuantity: order.acceptedQuantity.toString(),
    });
    const snapshot = await this.prisma.manufacturingCostSnapshot.create({
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
        inputSnapshot: { materialIssues: movements.map((movement) => ({ id: movement.id, quantity: movement.quantity.toString(), unitCost: movement.unitCost?.toString() ?? null })), laborEntries: laborEntries.map((entry) => ({ id: entry.id, minutes: entry.minutes.toString(), hourlyRate: entry.hourlyRate.toString() })), overheadCost: "0", targetQuantity: order.quantity.toString(), producedQuantity: order.producedQuantity.toString(), acceptedQuantity: order.acceptedQuantity.toString() },
        createdById: actorId,
      },
    });
    await this.prisma.auditLog.create({ data: { actorId, action: "manufacturing_cost.actual.created", entityType: "ManufacturingOrder", entityId: order.id, source: "costing", metadata: { snapshotId: snapshot.id, totalCost: snapshot.totalCost.toString(), wipCost: snapshot.wipCost.toString(), valuationComplete: snapshot.valuationComplete } } });
    return snapshot;
  }

  async list(manufacturingOrderId: string) {
    const exists = await this.prisma.manufacturingOrder.findUnique({ where: { id: manufacturingOrderId }, select: { id: true } });
    if (!exists) throw new CostingApplicationError("NOT_FOUND", "Manufacturing order not found");
    return this.prisma.manufacturingCostSnapshot.findMany({ where: { manufacturingOrderId }, orderBy: { createdAt: "desc" } });
  }
}
