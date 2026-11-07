import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import { MasterDataError } from "./item-service";

const conversionInputSchema = z.object({
  fromUomId: z.string().uuid(),
  toUomId: z.string().uuid(),
  factor: z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThan(0)),
});

export class UomConversionService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.uomConversion.findMany({
      orderBy: [{ fromUom: { code: "asc" } }, { toUom: { code: "asc" } }],
      include: { fromUom: true, toUom: true },
    });
  }

  async create(actorId: string, input: unknown) {
    const parsed = conversionInputSchema.safeParse(input);
    if (!parsed.success) throw new MasterDataError("INVALID_INPUT", parsed.error.message);
    const values = parsed.data;
    if (values.fromUomId === values.toUomId) throw new MasterDataError("INVALID_INPUT", "Conversion units must differ");

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const units = await transaction.unitOfMeasure.findMany({
          where: { id: { in: [values.fromUomId, values.toUomId] }, status: "ACTIVE" },
          select: { id: true, code: true, dimension: true },
        });
        const source = units.find((unit) => unit.id === values.fromUomId);
        const target = units.find((unit) => unit.id === values.toUomId);
        if (!source || !target) throw new MasterDataError("INVALID_INPUT", "Both UOMs must be active");
        if (source.dimension !== target.dimension) throw new MasterDataError("INVALID_INPUT", "UOM dimensions must match");

        const existing = await transaction.uomConversion.findFirst({
          where: { OR: [
            { fromUomId: values.fromUomId, toUomId: values.toUomId },
            { fromUomId: values.toUomId, toUomId: values.fromUomId },
          ] },
          select: { id: true, fromUomId: true, toUomId: true, factor: true },
        });
        if (existing) throw new MasterDataError("CONFLICT", "A conversion already exists for this UOM pair");

        const conversion = await transaction.uomConversion.create({
          data: { fromUomId: values.fromUomId, toUomId: values.toUomId, factor: new Prisma.Decimal(values.factor) },
          include: { fromUom: true, toUom: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "uom_conversion.created",
            entityType: "UomConversion",
            entityId: conversion.id,
            source: "master-data",
            metadata: { from: source.code, to: target.code, factor: conversion.factor.toString() },
          },
        });
        return conversion;
      });
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MasterDataError("CONFLICT", "Conversion already exists");
      }
      throw error;
    }
  }
}
