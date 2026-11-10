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
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue; throw error; }
  }
}

export class QualityService {
  private readonly inventory: InventoryService;
  constructor(private readonly prisma: PrismaClient) { this.inventory = new InventoryService(prisma); }

  async pendingOrders(input: { limit?: number; offset?: number } = {}) {
    if ((input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) || (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0))) {
      throw new QualityError("INVALID_INPUT", "Pagination limit and offset must be non-negative safe integers (limit must be positive)");
    }
    const limit = Math.min(input.limit ?? 100, 100);
    const offset = input.offset ?? 0;
    const where = { status: { in: ["IN_PROGRESS", "QC_PENDING"] as Array<"IN_PROGRESS" | "QC_PENDING"> }, producedQuantity: { gt: 0 } };
    const [data, total] = await Promise.all([
      this.prisma.manufacturingOrder.findMany({
        where, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit, skip: offset,
        include: { item: { select: { sku: true, name: true } }, workOrders: { select: { id: true, number: true, sequence: true, completedQty: true, rejectedQty: true, status: true } } },
      }),
      this.prisma.manufacturingOrder.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async inspections(input: { limit?: number; offset?: number } = {}) {
    if ((input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)) || (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0))) {
      throw new QualityError("INVALID_INPUT", "Pagination limit and offset must be non-negative safe integers (limit must be positive)");
    }
    const limit = Math.min(input.limit ?? 100, 100);
    const offset = input.offset ?? 0;
    const [data, total] = await Promise.all([
      this.prisma.qcInspection.findMany({
        orderBy: [{ inspectedAt: "desc" }, { id: "asc" }], take: limit, skip: offset,
        include: { manufacturingOrder: { select: { id: true, number: true, status: true, warehouseId: true, item: { select: { sku: true, name: true } } } }, productionReceipts: { select: { id: true, number: true, acceptedQty: true, status: true } } },
      }),
      this.prisma.qcInspection.count(),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async finishedGoodsWarehouses() {
    return this.prisma.warehouse.findMany({ where: { status: "ACTIVE", isWip: false }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  }

  async createInspection(actorId: string, input: unknown) {
    const parsed = qcInspectionCreateSchema.safeParse(input);
    if (!parsed.success) throw new QualityError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    try {
      return await serializable(this.prisma, async (transaction) => {
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
    } catch (error) {
      if (error instanceof QualityError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new QualityError("CONFLICT", "QC inspection number already exists");
      }
      throw error;
    }
  }

  async deleteInspection(actorId: string, inspectionId: string) {
    return serializable(this.prisma, async (transaction) => {
      const inspection = await transaction.qcInspection.findUnique({ where: { id: inspectionId } });
      if (!inspection) throw new QualityError("NOT_FOUND", "QC inspection not found");
      if (inspection.status !== "DRAFT") throw new QualityError("INVALID_STATE", "Only draft inspections can be deleted");
      await transaction.qcInspection.delete({ where: { id: inspectionId } });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "qc_inspection.deleted",
          entityType: "QcInspection",
          entityId: inspectionId,
          source: "quality",
          metadata: { number: inspection.number },
        },
      });
      return { success: true };
    });
  }

  async postInspection(actorId: string, inspectionId: string) {
    return serializable(this.prisma, async (transaction) => {
      const inspection = await transaction.qcInspection.findUnique({ where: { id: inspectionId }, include: { manufacturingOrder: true } });
      if (!inspection) throw new QualityError("NOT_FOUND", "QC inspection not found");
      if (inspection.status === "POSTED") return inspection;
      if (inspection.status !== "DRAFT") throw new QualityError("INVALID_STATE", "Only draft inspections can be posted");
      if (inspection.manufacturingOrder.status !== "IN_PROGRESS" && inspection.manufacturingOrder.status !== "QC_PENDING") throw new QualityError("INVALID_STATE", "Manufacturing order is not accepting inspections");

      const availableToInspect = inspection.manufacturingOrder.producedQuantity.minus(inspection.manufacturingOrder.inspectedQuantity);
      const isRework = inspection.notes?.includes("[REWORK]") || (availableToInspect.isZero() && inspection.manufacturingOrder.reworkQuantity.greaterThanOrEqualTo(inspection.inspectedQty));

      if (isRework) {
        if (inspection.inspectedQty.greaterThan(inspection.manufacturingOrder.reworkQuantity)) {
          throw new QualityError("INSUFFICIENT_OUTPUT", "Inspection exceeds outstanding rework quantity");
        }
        const updated = await transaction.qcInspection.updateMany({ where: { id: inspectionId, status: "DRAFT" }, data: { status: "POSTED", postedAt: new Date() } });
        if (updated.count !== 1) throw new QualityError("CONFLICT", "Inspection changed concurrently");

        // Rework units were already accounted for in inspectedQuantity during first-pass inspection.
        // Net rework reduction is inspectedQty - reworkQty (which equals acceptedQty + rejectedQty).
        const netReworkReduction = inspection.acceptedQty.plus(inspection.rejectedQty);
        const orderUpdated = await transaction.manufacturingOrder.updateMany({
          where: {
            id: inspection.manufacturingOrderId,
            reworkQuantity: { gte: inspection.inspectedQty },
          },
          data: {
            reworkQuantity: { decrement: netReworkReduction },
            acceptedQuantity: { increment: inspection.acceptedQty },
            rejectedQuantity: { increment: inspection.rejectedQty },
          },
        });
        if (orderUpdated.count !== 1) throw new QualityError("CONFLICT", "Rework capacity changed concurrently; reload and retry");
      } else {
        if (inspection.inspectedQty.greaterThan(availableToInspect)) {
          throw new QualityError("INSUFFICIENT_OUTPUT", "Inspection exceeds produced quantity");
        }
        const updated = await transaction.qcInspection.updateMany({ where: { id: inspectionId, status: "DRAFT" }, data: { status: "POSTED", postedAt: new Date() } });
        if (updated.count !== 1) throw new QualityError("CONFLICT", "Inspection changed concurrently");

        const orderUpdated = await transaction.manufacturingOrder.updateMany({
          where: {
            id: inspection.manufacturingOrderId,
            inspectedQuantity: inspection.manufacturingOrder.inspectedQuantity,
            producedQuantity: { gte: inspection.manufacturingOrder.inspectedQuantity.plus(inspection.inspectedQty) },
          },
          data: {
            inspectedQuantity: { increment: inspection.inspectedQty },
            acceptedQuantity: { increment: inspection.acceptedQty },
            rejectedQuantity: { increment: inspection.rejectedQty },
            reworkQuantity: { increment: inspection.reworkQty },
          },
        });
        if (orderUpdated.count !== 1) throw new QualityError("CONFLICT", "Inspection capacity changed concurrently; reload and retry");
      }

      // Check if order is fully inspected and all accepted outputs received (or all outputs scrapped)
      const refreshedOrder = await transaction.manufacturingOrder.findUniqueOrThrow({ where: { id: inspection.manufacturingOrderId } });
      const completedWorkOrders = await transaction.workOrder.count({ where: { manufacturingOrderId: refreshedOrder.id, status: "COMPLETED" } });
      const totalWorkOrders = await transaction.workOrder.count({ where: { manufacturingOrderId: refreshedOrder.id } });
      const totalReceived = await transaction.productionReceipt.aggregate({ where: { manufacturingOrderId: refreshedOrder.id, status: "POSTED" }, _sum: { acceptedQty: true } });
      const receivedAccepted = totalReceived._sum.acceptedQty ?? new Prisma.Decimal(0);

      const fullyInspected = refreshedOrder.inspectedQuantity.greaterThanOrEqualTo(refreshedOrder.producedQuantity);
      const allAcceptedReceived = receivedAccepted.greaterThanOrEqualTo(refreshedOrder.acceptedQuantity);
      const allOperationsComplete = totalWorkOrders > 0 && completedWorkOrders === totalWorkOrders;
      const noOutstandingRework = refreshedOrder.reworkQuantity.isZero();
      const complete = fullyInspected && allAcceptedReceived && allOperationsComplete && noOutstandingRework;

      if (complete && refreshedOrder.status !== "COMPLETED") {
        await transaction.manufacturingOrder.update({
          where: { id: refreshedOrder.id },
          data: { status: "COMPLETED" },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorId,
          action: isRework ? "qc_inspection.rework_posted" : "qc_inspection.posted",
          entityType: "QcInspection",
          entityId: inspectionId,
          source: "quality",
          metadata: {
            manufacturingOrderId: inspection.manufacturingOrderId,
            acceptedQty: inspection.acceptedQty.toString(),
            rejectedQty: inspection.rejectedQty.toString(),
            reworkQty: inspection.reworkQty.toString(),
            isRework,
          },
        },
      });

      return transaction.qcInspection.findUniqueOrThrow({ where: { id: inspectionId } });
    });
  }

  async postProductionReceipt(actorId: string, input: unknown) {
    const parsed = productionReceiptCreateSchema.safeParse(input);
    if (!parsed.success) throw new QualityError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    try {
      return await serializable(this.prisma, async (transaction) => {
        const duplicate = await transaction.productionReceipt.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
        if (duplicate) {
          if (duplicate.number !== value.number || duplicate.manufacturingOrderId !== value.manufacturingOrderId || duplicate.inspectionId !== value.inspectionId || duplicate.warehouseId !== value.warehouseId || !duplicate.acceptedQty.equals(value.acceptedQty)) throw new QualityError("CONFLICT", "Production receipt idempotency conflict");
          if (duplicate.status !== "POSTED") throw new QualityError("INVALID_STATE", "Production receipt with this idempotency key exists but has not been posted");
          return duplicate;
        }
        const [order, inspection, warehouse] = await Promise.all([
          transaction.manufacturingOrder.findUnique({ where: { id: value.manufacturingOrderId } }),
          transaction.qcInspection.findUnique({ where: { id: value.inspectionId } }),
          transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE", isWip: false }, select: { id: true } }),
        ]);
        if (!order || !inspection) throw new QualityError("NOT_FOUND", "Manufacturing order or inspection not found");
        if (order.status !== "IN_PROGRESS" && order.status !== "QC_PENDING") throw new QualityError("INVALID_STATE", "Manufacturing order is not accepting production receipts");
        if (!warehouse) throw new QualityError("INVALID_INPUT", "Finished goods warehouse must be active and non-WIP");
        if (inspection.manufacturingOrderId !== order.id || inspection.status !== "POSTED") throw new QualityError("INVALID_STATE", "A posted QC inspection for this MO is required");
        const previouslyReceived = await transaction.productionReceipt.aggregate({ where: { inspectionId: inspection.id, status: "POSTED" }, _sum: { acceptedQty: true } });
        const remainingAccepted = inspection.acceptedQty.minus(previouslyReceived._sum.acceptedQty ?? new Prisma.Decimal(0));
        const accepted = decimal(value.acceptedQty);
        if (accepted.greaterThan(remainingAccepted)) throw new QualityError("INSUFFICIENT_OUTPUT", "Receipt exceeds unreceived accepted QC quantity");
        const receipt = await transaction.productionReceipt.create({ data: { number: value.number, manufacturingOrderId: order.id, inspectionId: inspection.id, warehouseId: warehouse.id, acceptedQty: accepted, idempotencyKey: value.idempotencyKey, actorId } });
        await this.inventory.postProductionReceiptMovement(transaction, { actorId, itemId: order.itemId, warehouseId: warehouse.id, quantity: value.acceptedQty, receiptId: receipt.id, receiptNumber: receipt.number, idempotencyKey: `production-receipt:${receipt.id}` });
        const newCompleted = order.completedQuantity.plus(accepted);
        const totalAfterReceipt = await transaction.productionReceipt.aggregate({ where: { manufacturingOrderId: order.id, status: "POSTED" }, _sum: { acceptedQty: true } });
        const acceptedAfterReceipt = (totalAfterReceipt._sum.acceptedQty ?? new Prisma.Decimal(0)).plus(accepted);
        if (acceptedAfterReceipt.greaterThan(order.acceptedQuantity)) throw new QualityError("INSUFFICIENT_OUTPUT", "Receipt quantity exceeds accepted QC quantity for the manufacturing order");
        const completedWorkOrders = await transaction.workOrder.count({ where: { manufacturingOrderId: order.id, status: "COMPLETED" } });
        const totalWorkOrders = await transaction.workOrder.count({ where: { manufacturingOrderId: order.id } });
        const fullyInspected = order.inspectedQuantity.greaterThanOrEqualTo(order.producedQuantity);
        const allAcceptedReceived = acceptedAfterReceipt.greaterThanOrEqualTo(order.acceptedQuantity);
        const allOperationsComplete = totalWorkOrders > 0 && completedWorkOrders === totalWorkOrders;
        // Rework has no execution/reinspection lifecycle yet, so never silently close an MO with unresolved rework.
        const noOutstandingRework = order.reworkQuantity.isZero();
        const complete = fullyInspected && allAcceptedReceived && allOperationsComplete && noOutstandingRework;
        const nextStatus = complete ? "COMPLETED" : allOperationsComplete ? "QC_PENDING" : order.status;
        await transaction.manufacturingOrder.update({ where: { id: order.id }, data: { completedQuantity: newCompleted, status: nextStatus } });
        const posted = await transaction.productionReceipt.update({ where: { id: receipt.id }, data: { status: "POSTED", postedAt: new Date() } });
        await transaction.auditLog.create({ data: { actorId, action: "production_receipt.posted", entityType: "ProductionReceipt", entityId: receipt.id, source: "quality", metadata: { manufacturingOrderId: order.id, acceptedQty: value.acceptedQty, warehouseId: warehouse.id } } });
        return posted;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.productionReceipt.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
        if (duplicate) {
          if (duplicate.number !== value.number || duplicate.manufacturingOrderId !== value.manufacturingOrderId || duplicate.inspectionId !== value.inspectionId || duplicate.warehouseId !== value.warehouseId || !duplicate.acceptedQty.equals(value.acceptedQty)) throw new QualityError("CONFLICT", "Production receipt idempotency conflict");
          if (duplicate.status !== "POSTED") throw new QualityError("INVALID_STATE", "Production receipt with this idempotency key exists but has not been posted");
          return duplicate;
        }
        throw new QualityError("CONFLICT", "Production receipt number already exists");
      }
      throw error;
    }
  }
}
