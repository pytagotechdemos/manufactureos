import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import { assertCanComplete, assertCanPause, assertCanStart, WorkOrderPolicyError } from "@/modules/manufacturing/domain/work-order-policy";

const nonnegative = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/);
const positive = z.string().trim().regex(/^\d{1,13}(\.\d{1,6})?$/).refine((value) => new Decimal(value).greaterThan(0));
const timeEntrySchema = z.object({ minutes: positive, idempotencyKey: z.string().trim().min(8).max(120) });
const workCenterSchema = z.object({ workCenterId: z.string().uuid() });
const workOrderListSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const workOutputSchema = z.object({ completedQty: positive, rejectedQty: nonnegative.default("0") });

export class WorkOrderError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INVALID_OUTPUT" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" | "DEPENDENCY", message: string) {
    super(message);
    this.name = "WorkOrderError";
  }
}

function assertPolicy(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof WorkOrderPolicyError) throw new WorkOrderError(error.code, error.message);
    throw error;
  }
}

async function serializable<T>(prisma: PrismaClient, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

export class WorkOrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: unknown) {
    const parsed = workOrderListSchema.safeParse(input);
    if (!parsed.success) throw new WorkOrderError("INVALID_INPUT", parsed.error.message);
    const where = parsed.data.status ? { status: parsed.data.status } : {};
    const [data, total] = await Promise.all([this.prisma.workOrder.findMany({
      where,
      take: parsed.data.limit,
      skip: parsed.data.offset,
      orderBy: [{ manufacturingOrder: { createdAt: "desc" } }, { sequence: "asc" }, { id: "asc" }],
      include: {
        manufacturingOrder: {
          select: { id: true, number: true, status: true, item: { select: { sku: true, name: true } } },
        },
        workCenter: { select: { id: true, code: true, name: true } },
        timeEntries: { select: { minutes: true } },
      },
    }), this.prisma.workOrder.count({ where })]);
    return { data, page: { limit: parsed.data.limit, offset: parsed.data.offset, total } };
  }

  async get(workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { manufacturingOrder: { select: { id: true, number: true, status: true, quantity: true } }, timeEntries: { orderBy: { createdAt: "asc" } } } });
    if (!workOrder) throw new WorkOrderError("NOT_FOUND", "Work order not found");
    return workOrder;
  }

  async start(actorId: string, workOrderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const workOrder = await transaction.workOrder.findUnique({ where: { id: workOrderId }, include: { manufacturingOrder: true } });
      if (!workOrder) throw new WorkOrderError("NOT_FOUND", "Work order not found");
      if (workOrder.manufacturingOrder.status !== "RELEASED" && workOrder.manufacturingOrder.status !== "IN_PROGRESS") throw new WorkOrderError("INVALID_STATE", "Manufacturing order must be released before work starts");
      const previous = await transaction.workOrder.findFirst({ where: { manufacturingOrderId: workOrder.manufacturingOrderId, sequence: { lt: workOrder.sequence } }, orderBy: { sequence: "desc" } });
      assertPolicy(() => assertCanStart(workOrder.status, previous?.status));
      const updated = await transaction.workOrder.update({ where: { id: workOrderId }, data: { status: "IN_PROGRESS", startedAt: workOrder.startedAt ?? new Date() } });
      await transaction.manufacturingOrder.updateMany({ where: { id: workOrder.manufacturingOrderId, status: "RELEASED" }, data: { status: "IN_PROGRESS", actualStart: new Date() } });
      await transaction.auditLog.create({ data: { actorId, action: workOrder.status === "PAUSED" ? "work_order.resumed" : "work_order.started", entityType: "WorkOrder", entityId: workOrderId, source: "manufacturing", metadata: { number: workOrder.number } } });
      return updated;
    });
  }

  async pause(actorId: string, workOrderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const workOrder = await transaction.workOrder.findUnique({ where: { id: workOrderId }, include: { manufacturingOrder: true } });
      if (!workOrder) throw new WorkOrderError("NOT_FOUND", "Work order not found");
      if (workOrder.manufacturingOrder.status !== "IN_PROGRESS") throw new WorkOrderError("INVALID_STATE", "Manufacturing order is not in progress");
      assertPolicy(() => assertCanPause(workOrder.status));
      const updated = await transaction.workOrder.update({ where: { id: workOrderId, status: "IN_PROGRESS" }, data: { status: "PAUSED" } });
      await transaction.auditLog.create({ data: { actorId, action: "work_order.paused", entityType: "WorkOrder", entityId: workOrderId, source: "manufacturing", metadata: { number: workOrder.number } } });
      return updated;
    });
  }

  async assignWorkCenter(actorId: string, workOrderId: string, input: unknown) {
    const parsed = workCenterSchema.safeParse(input);
    if (!parsed.success) throw new WorkOrderError("INVALID_INPUT", parsed.error.message);
    return serializable(this.prisma, async (transaction) => {
      const [workOrder, workCenter] = await Promise.all([
        transaction.workOrder.findUnique({ where: { id: workOrderId } }),
        transaction.workCenter.findFirst({ where: { id: parsed.data.workCenterId, status: "ACTIVE" } }),
      ]);
      if (!workOrder || !workCenter) throw new WorkOrderError("NOT_FOUND", "Work order or active work center not found");
      const mayAssign = workOrder.status === "PENDING" || (workOrder.status === "IN_PROGRESS" && workOrder.workCenterId === null);
      if (!mayAssign) throw new WorkOrderError("INVALID_STATE", "Work center can only be assigned to a pending order or an in-progress order without a work center");
      const updated = await transaction.workOrder.updateMany({
        where: { id: workOrderId, status: workOrder.status, workCenterId: workOrder.workCenterId },
        data: { workCenterId: workCenter.id, workCenterCode: workCenter.code, standardMinutes: workCenter.standardMinutes },
      });
      if (updated.count !== 1) throw new WorkOrderError("CONFLICT", "Work order changed while assigning work center");
      const result = await transaction.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
      await transaction.auditLog.create({ data: { actorId, action: "work_order.work_center.assigned", entityType: "WorkOrder", entityId: workOrderId, source: "manufacturing", metadata: { workCenterId: workCenter.id, code: workCenter.code } } });
      return result;
    });
  }

  async recordTime(actorId: string, workOrderId: string, input: unknown) {
    const parsed = timeEntrySchema.safeParse(input);
    if (!parsed.success) throw new WorkOrderError("INVALID_INPUT", parsed.error.message);
    try {
      return await serializable(this.prisma, async (transaction) => {
        const duplicate = await transaction.workOrderTimeEntry.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
        if (duplicate) {
          if (duplicate.workOrderId !== workOrderId || !duplicate.minutes.equals(parsed.data.minutes)) throw new WorkOrderError("CONFLICT", "Time entry idempotency key conflicts with a different entry");
          return duplicate;
        }
        const workOrder = await transaction.workOrder.findUnique({ where: { id: workOrderId }, include: { workCenter: true, manufacturingOrder: true } });
        if (!workOrder) throw new WorkOrderError("NOT_FOUND", "Work order not found");
        if (workOrder.manufacturingOrder.status !== "IN_PROGRESS") throw new WorkOrderError("INVALID_STATE", "Manufacturing order is not in progress");
        if (workOrder.status !== "IN_PROGRESS") throw new WorkOrderError("INVALID_STATE", "Time can only be recorded for an in-progress work order");
        if (!workOrder.workCenter || workOrder.workCenter.status !== "ACTIVE") throw new WorkOrderError("INVALID_STATE", "An active work center with an hourly rate must be assigned");
        const entry = await transaction.workOrderTimeEntry.create({ data: { workOrderId, idempotencyKey: parsed.data.idempotencyKey, minutes: new Prisma.Decimal(parsed.data.minutes), hourlyRate: workOrder.workCenter.hourlyRate, actorId } });
        await transaction.auditLog.create({ data: { actorId, action: "work_order.time.recorded", entityType: "WorkOrderTimeEntry", entityId: entry.id, source: "manufacturing", metadata: { workOrderId, minutes: entry.minutes.toString(), workCenterCode: workOrder.workCenter.code } } });
        return entry;
      });
    } catch (error) {
      if (error instanceof WorkOrderError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.workOrderTimeEntry.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
        if (duplicate) {
          if (duplicate.workOrderId !== workOrderId || !duplicate.minutes.equals(parsed.data.minutes)) throw new WorkOrderError("CONFLICT", "Time entry idempotency key conflicts with a different entry");
          return duplicate;
        }
        throw new WorkOrderError("CONFLICT", "Time entry idempotency key conflicts with an existing entry");
      }
      throw error;
    }
  }

  async complete(actorId: string, workOrderId: string, input: unknown) {
    const parsed = workOutputSchema.safeParse(input);
    if (!parsed.success) throw new WorkOrderError("INVALID_INPUT", parsed.error.message);
    return serializable(this.prisma, async (transaction) => {
      const workOrder = await transaction.workOrder.findUnique({ where: { id: workOrderId }, include: { manufacturingOrder: true } });
      if (!workOrder) throw new WorkOrderError("NOT_FOUND", "Work order not found");
      if (workOrder.manufacturingOrder.status !== "IN_PROGRESS") throw new WorkOrderError("INVALID_STATE", "Manufacturing order is not in progress");
      const accepted = new Prisma.Decimal(parsed.data.completedQty);
      const rejected = new Prisma.Decimal(parsed.data.rejectedQty);
      assertPolicy(() => assertCanComplete(workOrder.status, workOrder.completedQty.toString(), workOrder.rejectedQty.toString(), workOrder.targetQuantity.toString(), accepted.toString(), rejected.toString()));
      const updated = await transaction.workOrder.update({ where: { id: workOrderId, status: "IN_PROGRESS" }, data: { status: "COMPLETED", completedQty: { increment: accepted }, rejectedQty: { increment: rejected }, completedAt: new Date() } });
      const allWorkOrders = await transaction.workOrder.findMany({ where: { manufacturingOrderId: workOrder.manufacturingOrderId }, orderBy: { sequence: "asc" }, select: { status: true, completedQty: true, rejectedQty: true } });
      const allCompleted = allWorkOrders.length > 0 && allWorkOrders.every((entry) => entry.status === "COMPLETED");
      const finalOperation = allWorkOrders.at(-1);
      const finalOperationOutput = finalOperation ? finalOperation.completedQty.plus(finalOperation.rejectedQty) : new Prisma.Decimal(0);
      const orderUpdate = await transaction.manufacturingOrder.updateMany({
        where: { id: workOrder.manufacturingOrderId, status: "IN_PROGRESS" },
        data: {
          ...(allCompleted ? { producedQuantity: finalOperationOutput, status: "QC_PENDING" as const, actualEnd: new Date() } : { status: "IN_PROGRESS" }),
        },
      });
      if (orderUpdate.count !== 1) throw new WorkOrderError("INVALID_STATE", "Manufacturing order state changed while completing work");
      await transaction.auditLog.create({ data: { actorId, action: "work_order.completed", entityType: "WorkOrder", entityId: workOrderId, source: "manufacturing", metadata: { number: workOrder.number, completedQty: parsed.data.completedQty, rejectedQty: parsed.data.rejectedQty } } });
      return updated;
    });
  }
}
