import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";

const nonnegative = z.string().trim().regex(/^\d{1,13}(\.\d{1,4})?$/).refine((value) => new Decimal(value).greaterThanOrEqualTo(0));
export const workCenterCreateSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), hourlyRate: nonnegative, standardMinutes: nonnegative });
export const workCenterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  hourlyRate: nonnegative.optional(),
  standardMinutes: nonnegative.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
const createSchema = workCenterCreateSchema;
const updateSchema = workCenterUpdateSchema;

export class WorkCenterError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.name = "WorkCenterError";
  }
}

export class WorkCenterService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(includeInactive = false) {
    return this.prisma.workCenter.findMany({
      where: includeInactive ? {} : { status: "ACTIVE" },
      orderBy: [{ status: "asc" }, { code: "asc" }],
      include: {
        _count: { select: { workOrders: true } },
      },
    });
  }

  async create(actorId: string, input: unknown) {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) throw new WorkCenterError("INVALID_INPUT", parsed.error.message);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const workCenter = await transaction.workCenter.create({ data: { ...parsed.data, hourlyRate: new Prisma.Decimal(parsed.data.hourlyRate), standardMinutes: new Prisma.Decimal(parsed.data.standardMinutes) } });
        await transaction.auditLog.create({ data: { actorId, action: "work_center.created", entityType: "WorkCenter", entityId: workCenter.id, source: "master-data", metadata: { code: workCenter.code, hourlyRate: workCenter.hourlyRate.toString() } } });
        return workCenter;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new WorkCenterError("CONFLICT", "Work center code already exists");
      throw error;
    }
  }

  async update(actorId: string, id: string, input: unknown) {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) throw new WorkCenterError("INVALID_INPUT", parsed.error.message);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.workCenter.findUnique({ where: { id } });
        if (!existing) throw new WorkCenterError("NOT_FOUND", "Work center not found");
        const updated = await transaction.workCenter.update({
          where: { id },
          data: {
            ...(parsed.data.name ? { name: parsed.data.name } : {}),
            ...(parsed.data.hourlyRate ? { hourlyRate: new Prisma.Decimal(parsed.data.hourlyRate) } : {}),
            ...(parsed.data.standardMinutes ? { standardMinutes: new Prisma.Decimal(parsed.data.standardMinutes) } : {}),
            ...(parsed.data.status ? { status: parsed.data.status } : {}),
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "work_center.updated",
            entityType: "WorkCenter",
            entityId: updated.id,
            source: "master-data",
            metadata: { code: updated.code, changes: parsed.data },
          },
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof WorkCenterError) throw error;
      throw error;
    }
  }
}
