import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { InventoryService } from "@/modules/inventory/application/inventory-service";
import { productionReceiptCreateSchema, qcInspectionCreateSchema } from "./quality-validation";

export class QualityError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" | "INSUFFICIENT_OUTPUT", message: string) {
    super(message);
    this.name = "QualityError";
  }
}

function decimal(value: string) { return new Prisma.Decimal(value); }

async function serializable<T>(prisma: PrismaClient, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue; throw error; }
  }
}

export class QualityService {
  private readonly inventory: InventoryService;
  constructor(private readonly prisma: PrismaClient) { this.inventory = new InventoryService(prisma); }

  async pendingOrders() {
    return this.prisma.manufacturingOrder.findMany({
      where: { status: { in: ["IN_PROGRESS", "QC_PENDING"] }, producedQuantity: { gt: 0 } },
      orderBy: { updatedAt: "asc" },
      take: 100,
      include: { item: { select: { sku: true, name: true } }, workOrders: { select: { id: true, number: true, sequence: true, completedQty: true, rejectedQty: true, status: true } } },
    });
  }

  async inspections() {
    return this.prisma.qcInspection.findMany({
      orderBy: { inspectedAt: "desc" },
      take: 100,
      include: { manufacturingOrder: { select: { id: true, number: true, status: true, item: { select: { sku: true, name: true } } } }, productionReceipts: { select: { id: true, number: true, acceptedQty: true, status: true } } },
    });
  }

  async finishedGoodsWarehouses() {
    return this.prisma.warehouse.findMany({ where: { status: "ACTIVE", isWip: false }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  }

  async createInspection(actorId: string, input: unknown) {
    const parsed = qcInspectionCreateSchema.safeParse(input);
    if (!parsed.success) throw new QualityError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: value.manufacturingOrderId } });
      if (!order) throw new QualityError("NOT_FOUND", "Manufacturing order not found");
      if (order.status !== "IN_PROGRESS" && order.status !== "QC_PENDING") throw new QualityError("INVALID_STATE", "Manufacturing order is not ready for QC");
      if (value.workOrderId) {
        const workOrder = await transaction.workOrder.findUnique({ where: { id: value.workOrderId } });
        if (!workOrder || workOrder.manufacturingOrderId !== order.id) throw new QualityError("INVALID_INPUT", "Work order does not belong to manufacturing order");
      }
      const inspection = await transaction.qcInspection.create({ data: { number: value.number, manufacturingOrderId: order.id, workOrderId: value.workOrderId, inspectedQty: decimal(value.inspectedQty), acceptedQty: decimal(value.acceptedQty), rejectedQty: decimal(value.rejectedQty), reworkQty: decimal(value.reworkQty), inspectorId: actorId, defectCode: value.defectCode, notes: value.notes } });
      await transaction.auditLog.create({ data: { actorId, action: "qc_inspection.created", entityType: "QcInspection", entityId: inspection.id, source: "quality", metadata: { number: inspection.number, manufacturingOrderId: order.id, inspectedQty: value.inspectedQty } } });
      return inspection;
    });
  }

  async postInspection(actorId: string, inspectionId: string) {
    return serializable(this.prisma, async (transaction) => {
      const inspection = await transaction.qcInspection.findUnique({ where: { id: inspectionId }, include: { manufacturingOrder: true } });
      if (!inspection) throw new QualityError("NOT_FOUND", "QC inspection not found");
      if (inspection.status === "POSTED") return inspection;
      if (inspection.status !== "DRAFT") throw new QualityError("INVALID_STATE", "Only draft inspections can be posted");
      const availableToInspect = inspection.manufacturingOrder.producedQuantity.minus(inspection.manufacturingOrder.inspectedQuantity);
      if (inspection.inspectedQty.greaterThan(availableToInspect)) throw new QualityError("INSUFFICIENT_OUTPUT", "Inspection exceeds produced quantity");
      const updated = await transaction.qcInspection.updateMany({ where: { id: inspectionId, status: "DRAFT" }, data: { status: "POSTED", postedAt: new Date() } });
      if (updated.count !== 1) throw new QualityError("CONFLICT", "Inspection changed concurrently");
      await transaction.manufacturingOrder.update({ where: { id: inspection.manufacturingOrderId }, data: { inspectedQuantity: { increment: inspection.inspectedQty }, acceptedQuantity: { increment: inspection.acceptedQty }, rejectedQuantity: { increment: inspection.rejectedQty }, reworkQuantity: { increment: inspection.reworkQty } } });
      await transaction.auditLog.create({ data: { actorId, action: "qc_inspection.posted", entityType: "QcInspection", entityId: inspectionId, source: "quality", metadata: { manufacturingOrderId: inspection.manufacturingOrderId, acceptedQty: inspection.acceptedQty.toString(), rejectedQty: inspection.rejectedQty.toString(), reworkQty: inspection.reworkQty.toString() } } });
      return transaction.qcInspection.findUniqueOrThrow({ where: { id: inspectionId } });
    });
  }

  async postProductionReceipt(actorId: string, input: unknown) {
    const parsed = productionReceiptCreateSchema.safeParse(input);
    if (!parsed.success) throw new QualityError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    return serializable(this.prisma, async (transaction) => {
      const duplicate = await transaction.productionReceipt.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
      if (duplicate) {
        if (duplicate.manufacturingOrderId !== value.manufacturingOrderId || duplicate.inspectionId !== value.inspectionId || !duplicate.acceptedQty.equals(value.acceptedQty)) throw new QualityError("CONFLICT", "Production receipt idempotency conflict");
        return duplicate;
      }
      const [order, inspection, warehouse] = await Promise.all([
        transaction.manufacturingOrder.findUnique({ where: { id: value.manufacturingOrderId } }),
        transaction.qcInspection.findUnique({ where: { id: value.inspectionId } }),
        transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE", isWip: false }, select: { id: true } }),
      ]);
      if (!order || !inspection) throw new QualityError("NOT_FOUND", "Manufacturing order or inspection not found");
      if (!warehouse) throw new QualityError("INVALID_INPUT", "Finished goods warehouse must be active and non-WIP");
      if (inspection.manufacturingOrderId !== order.id || inspection.status !== "POSTED") throw new QualityError("INVALID_STATE", "A posted QC inspection for this MO is required");
      const previouslyReceived = await transaction.productionReceipt.aggregate({ where: { inspectionId: inspection.id, status: "POSTED" }, _sum: { acceptedQty: true } });
      const remainingAccepted = inspection.acceptedQty.minus(previouslyReceived._sum.acceptedQty ?? new Prisma.Decimal(0));
      const accepted = decimal(value.acceptedQty);
      if (accepted.greaterThan(remainingAccepted)) throw new QualityError("INSUFFICIENT_OUTPUT", "Receipt exceeds unreceived accepted QC quantity");
      const receipt = await transaction.productionReceipt.create({ data: { number: value.number, manufacturingOrderId: order.id, inspectionId: inspection.id, warehouseId: warehouse.id, acceptedQty: accepted, idempotencyKey: value.idempotencyKey, actorId } });
      await this.inventory.postProductionReceiptMovement(transaction, { actorId, itemId: order.itemId, warehouseId: warehouse.id, quantity: value.acceptedQty, receiptId: receipt.id, receiptNumber: receipt.number, idempotencyKey: `production-receipt:${receipt.id}` });
      const newCompleted = order.completedQuantity.plus(accepted);
      await transaction.manufacturingOrder.update({ where: { id: order.id }, data: { completedQuantity: newCompleted, status: newCompleted.greaterThanOrEqualTo(order.quantity) ? "COMPLETED" : "QC_PENDING" } });
      const posted = await transaction.productionReceipt.update({ where: { id: receipt.id }, data: { status: "POSTED", postedAt: new Date() } });
      await transaction.auditLog.create({ data: { actorId, action: "production_receipt.posted", entityType: "ProductionReceipt", entityId: receipt.id, source: "QUALITY", metadata: { manufacturingOrderId: order.id, acceptedQty: value.acceptedQty, warehouseId: warehouse.id } } });
      return posted;
    });
  }
}
