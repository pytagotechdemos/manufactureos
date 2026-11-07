import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";

const nonnegative = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThanOrEqualTo(0));
const createSchema = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120), hourlyRate: nonnegative, standardMinutes: nonnegative });

export class WorkCenterError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
    this.name = "WorkCenterError";
  }
}

export class WorkCenterService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.workCenter.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
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
}
