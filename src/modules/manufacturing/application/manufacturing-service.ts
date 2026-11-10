import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { InventoryService } from "@/modules/inventory/application/inventory-service";
import { explodeBom, type BomCatalog, type BomExplosionContext } from "@/modules/engineering/domain/bom-explosion";
import type { BomInput } from "@/modules/engineering/domain/bom-types";
import { materialDispositionSchema, materialIssueSchema, manufacturingOrderCreateSchema, manufacturingOrderListSchema } from "./manufacturing-validation";

export class ManufacturingError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" | "MISSING_BOM", message: string) {
    super(message);
    this.name = "ManufacturingError";
  }
}

function decimal(value: string) {
  return new Prisma.Decimal(new Decimal(value).toString());
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

function bomInput(bom: {
  id: string;
  outputItemId: string;
  outputQty: Prisma.Decimal;
  lines: Array<{ componentId: string; quantity: Prisma.Decimal; scrapRate: Prisma.Decimal; uom: { code: string }; component: { supplyType: "MAKE" | "BUY" } }>;
}): BomInput {
  return {
    bomId: bom.id,
    outputItemId: bom.outputItemId,
    outputQuantity: bom.outputQty.toString(),
    lines: bom.lines.map((line) => ({ componentItemId: line.componentId, quantity: line.quantity.toString(), scrapRate: line.scrapRate.toString(), uom: line.uom.code, make: line.component.supplyType === "MAKE" })),
  };
}

async function loadExplosionContext(transaction: Prisma.TransactionClient, effectiveAt: Date): Promise<{ catalog: BomCatalog; context: BomExplosionContext; snapshots: unknown[] }> {
  const [boms, items, uoms, conversions] = await Promise.all([
    transaction.bom.findMany({ where: { status: "APPROVED", effectiveDate: { lte: effectiveAt } }, orderBy: [{ outputItemId: "asc" }, { effectiveDate: "desc" }, { revision: "desc" }], include: { lines: { include: { uom: { select: { code: true } }, component: { select: { supplyType: true } } } } } }),
    transaction.item.findMany({ select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
    transaction.unitOfMeasure.findMany({ where: { status: "ACTIVE" }, select: { code: true, dimension: true, precision: true } }),
    transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
  ]);
  const catalog = new Map<string, BomInput[]>();
  const effectiveByItem = new Map<string, Date>();
  for (const bom of boms) {
    const priorEffectiveDate = effectiveByItem.get(bom.outputItemId);
    if (priorEffectiveDate && priorEffectiveDate.getTime() === bom.effectiveDate?.getTime()) {
      throw new ManufacturingError("MISSING_BOM", `Multiple approved BOM revisions for item ${bom.outputItemId} have the same effective date`);
    }
    if (!catalog.has(bom.outputItemId)) {
      catalog.set(bom.outputItemId, [bomInput(bom)]);
      if (bom.effectiveDate) effectiveByItem.set(bom.outputItemId, bom.effectiveDate);
    }
  }
  const context: BomExplosionContext = {
    itemUnits: new Map(items.map((item) => [item.id, { baseUom: item.baseUom.code, dimension: item.baseUom.dimension, precision: item.baseUom.precision }])),
    uoms: new Map(uoms.map((uom) => [uom.code, uom])),
    conversions: conversions.filter((conversion) => conversion.fromUom.dimension === conversion.toUom.dimension).map((conversion) => ({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString(), dimension: conversion.fromUom.dimension })),
    // A manufacturing order consumes the sub-assembly itself; the sub-assembly is
    // produced by its own MAKE order. Expanding further would consume the
    // sub-assembly components twice.
    stopAtMake: true,
  };
  return { catalog, context, snapshots: boms.map((bom) => ({ id: bom.id, outputItemId: bom.outputItemId, outputQty: bom.outputQty.toString(), effectiveDate: bom.effectiveDate?.toISOString() ?? null, lines: bomInput(bom).lines })) };
}

export class ManufacturingService {
  private readonly inventory: InventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.inventory = new InventoryService(prisma);
  }

  async createFromRecommendation(actorId: string, input: unknown) {
    const parsed = manufacturingOrderCreateSchema.safeParse(input);
    if (!parsed.success) throw new ManufacturingError("INVALID_INPUT", parsed.error.message);
    try {
      return await serializable(this.prisma, async (transaction) => {
        const [recommendation, warehouses] = await Promise.all([
          transaction.mrpRecommendation.findUnique({ where: { id: parsed.data.recommendationId }, include: { item: true } }),
          transaction.warehouse.findMany({ where: { id: { in: [parsed.data.warehouseId, parsed.data.wipWarehouseId] }, status: "ACTIVE" }, select: { id: true, isWip: true } }),
        ]);
        if (!recommendation) throw new ManufacturingError("NOT_FOUND", "MRP recommendation not found");
        const sourceWarehouse = warehouses.find((warehouse) => warehouse.id === parsed.data.warehouseId);
        const wipWarehouse = warehouses.find((warehouse) => warehouse.id === parsed.data.wipWarehouseId);
        if (!sourceWarehouse || !wipWarehouse || !wipWarehouse.isWip || sourceWarehouse.id === wipWarehouse.id) throw new ManufacturingError("INVALID_INPUT", "Select an active source warehouse and a distinct active WIP warehouse");
        if (recommendation.supplyType !== "MAKE" || recommendation.item.supplyType !== "MAKE") throw new ManufacturingError("INVALID_INPUT", "Only MAKE recommendations can create manufacturing orders");
        const existing = await transaction.manufacturingOrder.findFirst({ where: { sourceRecommendationId: recommendation.id, status: { not: "CANCELLED" } } });
        if (existing) throw new ManufacturingError("CONFLICT", "An active MO already exists for this recommendation");

        const { catalog, context, snapshots } = await loadExplosionContext(transaction, recommendation.requiredDate);
        const root = catalog.get(recommendation.itemId)?.[0];
        if (!root) throw new ManufacturingError("MISSING_BOM", "No effective approved BOM exists for this recommendation date");

        const exploded = explodeBom(root, recommendation.quantity.toString(), catalog, context);
        const order = await transaction.manufacturingOrder.create({
          data: {
            number: parsed.data.number,
            itemId: recommendation.itemId,
            quantity: recommendation.quantity,
            warehouseId: parsed.data.warehouseId,
            wipWarehouseId: parsed.data.wipWarehouseId,
            sourceRecommendationId: recommendation.id,
            bomId: root.bomId,
            bomSnapshot: { selectedBomId: root.bomId, revisionStructures: snapshots, explosion: exploded.tree } as Prisma.InputJsonValue,
            createdById: actorId,
            plannedStart: recommendation.plannedReleaseDate,
            plannedEnd: recommendation.requiredDate,
            materials: { create: exploded.requirements.map((requirement, index) => ({ itemId: requirement.itemId, plannedQty: decimal(requirement.quantity), uomCode: requirement.uom, sequence: index + 1 })) },
            workOrders: { create: { number: `${parsed.data.number}-001`, sequence: 1, operationCode: "ASSEMBLY", targetQuantity: recommendation.quantity } },
          },
          include: { materials: { include: { item: { select: { sku: true, name: true } } } }, workOrders: true },
        });
        await transaction.auditLog.create({ data: { actorId, action: "manufacturing_order.created", entityType: "ManufacturingOrder", entityId: order.id, source: "planning", metadata: { number: order.number, recommendationId: recommendation.id, bomId: root.bomId } } });
        return order;
      });
    } catch (error) {
      if (error instanceof ManufacturingError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ManufacturingError("CONFLICT", "Manufacturing order number already exists");
      }
      throw error;
    }
  }

  async plan(actorId: string, orderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      if (order.status !== "DRAFT") throw new ManufacturingError("INVALID_STATE", "Only draft manufacturing orders can be planned");
      const result = await transaction.manufacturingOrder.updateMany({ where: { id: orderId, status: "DRAFT" }, data: { status: "PLANNED" } });
      if (result.count !== 1) throw new ManufacturingError("CONFLICT", "Manufacturing order changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: "manufacturing_order.planned", entityType: "ManufacturingOrder", entityId: orderId, source: "manufacturing", metadata: { number: order.number } } });
      return transaction.manufacturingOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  async release(actorId: string, orderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: orderId }, include: { materials: true } });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      if (order.status !== "PLANNED") throw new ManufacturingError("INVALID_STATE", "Only planned manufacturing orders can be released");
      for (const material of order.materials) {
        const reservation = await this.inventory.reserveForManufacturingMaterial(transaction, {
          actorId,
          itemId: material.itemId,
          warehouseId: order.warehouseId,
          quantity: material.plannedQty.toString(),
          manufacturingOrderId: order.id,
          materialId: material.id,
        });
        await transaction.manufacturingOrderMaterial.update({ where: { id: material.id }, data: { reservationId: reservation.id } });
      }
      const result = await transaction.manufacturingOrder.updateMany({ where: { id: orderId, status: "PLANNED" }, data: { status: "RELEASED", releasedById: actorId, releasedAt: new Date() } });
      if (result.count !== 1) throw new ManufacturingError("CONFLICT", "Manufacturing order changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: "manufacturing_order.released", entityType: "ManufacturingOrder", entityId: orderId, source: "manufacturing", metadata: { number: order.number, materialCount: order.materials.length } } });
      return transaction.manufacturingOrder.findUniqueOrThrow({ where: { id: orderId }, include: { materials: true, workOrders: true } });
    });
  }

  async cancel(actorId: string, orderId: string, reason?: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({
        where: { id: orderId },
        include: { materials: true, workOrders: true },
      });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      if (order.status === "COMPLETED" || order.status === "CANCELLED" || order.status === "QC_PENDING") {
        throw new ManufacturingError("INVALID_STATE", "Completed, cancelled, or QC pending manufacturing orders cannot be cancelled");
      }
      const hasIssued = order.materials.some((m) => m.issuedQty.greaterThan(0));
      if (hasIssued) {
        throw new ManufacturingError("INVALID_STATE", "Cannot cancel manufacturing order with issued materials. Return WIP materials first.");
      }
      const hasActiveWork = order.workOrders.some((w) => w.status === "IN_PROGRESS" || w.status === "COMPLETED");
      if (hasActiveWork) {
        throw new ManufacturingError("INVALID_STATE", "Cannot cancel manufacturing order with active or completed work orders.");
      }

      if (order.status === "RELEASED") {
        for (const material of order.materials) {
          if (material.reservationId) {
            await this.inventory.releaseReservationInTransaction(transaction, actorId, material.reservationId);
            await transaction.manufacturingOrderMaterial.update({
              where: { id: material.id },
              data: { reservationId: null },
            });
          }
        }
      }

      await transaction.workOrder.updateMany({
        where: {
          manufacturingOrderId: orderId,
          status: { in: ["PENDING", "PAUSED"] },
        },
        data: { status: "CANCELLED" },
      });

      const updated = await transaction.manufacturingOrder.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
      });

      await transaction.auditLog.create({
        data: {
          actorId,
          action: "manufacturing_order.cancelled",
          entityType: "ManufacturingOrder",
          entityId: orderId,
          source: "manufacturing",
          metadata: { number: order.number, reason: reason ?? "User cancelled" },
        },
      });

      return updated;
    });
  }

  async issueMaterial(actorId: string, orderId: string, materialId: string, input: unknown) {
    const parsed = materialIssueSchema.safeParse(input);
    if (!parsed.success) throw new ManufacturingError("INVALID_INPUT", parsed.error.message);
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: materialId } });
      if (!material || material.manufacturingOrderId !== orderId) throw new ManufacturingError("NOT_FOUND", "Manufacturing material not found");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const outboundKey = `manufacturing-issue:${parsed.data.idempotencyKey}:out`;
      const inboundKey = `manufacturing-issue:${parsed.data.idempotencyKey}:in`;
      const existingMovements = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: [outboundKey, inboundKey] } } });
      if (existingMovements.length > 0) {
        const outbound = existingMovements.find((movement) => movement.idempotencyKey === outboundKey);
        const inbound = existingMovements.find((movement) => movement.idempotencyKey === inboundKey);
        if (
          existingMovements.length !== 2 || !outbound || !inbound ||
          outbound.movementType !== "TRANSFER_OUT" || inbound.movementType !== "TRANSFER_IN" ||
          [outbound, inbound].some((movement) => movement.itemId !== material.itemId || movement.sourceType !== "MANUFACTURING_ORDER" || movement.sourceId !== `${orderId}:${materialId}` || !movement.quantity.equals(quantity)) ||
          outbound.warehouseId === inbound.warehouseId ||
          inbound.warehouseId !== order.wipWarehouseId
        ) throw new ManufacturingError("CONFLICT", "Idempotency key belongs to another material issue");
        return { materialId, movementId: outbound.id, issuedQty: material.issuedQty.toString() };
      }
      if (order.status !== "RELEASED" && order.status !== "IN_PROGRESS") throw new ManufacturingError("INVALID_STATE", "Materials can only be issued for released or in-progress orders");
      if (material.issuedQty.plus(quantity).greaterThan(material.plannedQty)) throw new ManufacturingError("INVALID_INPUT", "Issue quantity exceeds planned material quantity");
      const movement = await this.inventory.issueReservedManufacturingMaterial(transaction, { actorId, materialId, manufacturingOrderId: orderId, quantity: parsed.data.quantity, idempotencyKey: parsed.data.idempotencyKey });
      const materialUpdated = await transaction.manufacturingOrderMaterial.updateMany({ where: { id: materialId, issuedQty: material.issuedQty }, data: { issuedQty: { increment: quantity } } });
      if (materialUpdated.count !== 1) throw new ManufacturingError("CONFLICT", "Material issue quantity changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: "manufacturing_order.material_issued", entityType: "ManufacturingOrderMaterial", entityId: materialId, source: "manufacturing", metadata: { manufacturingOrderId: orderId, quantity: parsed.data.quantity, movementId: movement.id } } });
      return { materialId, movementId: movement.id, issuedQty: material.issuedQty.plus(quantity).toString() };
    });
  }

  async consumeMaterial(actorId: string, orderId: string, materialId: string, input: unknown) {
    return this.dispositionMaterial(actorId, orderId, materialId, input, "CONSUMPTION");
  }

  async returnMaterial(actorId: string, orderId: string, materialId: string, input: unknown) {
    return this.dispositionMaterial(actorId, orderId, materialId, input, "RETURN");
  }

  private async dispositionMaterial(actorId: string, orderId: string, materialId: string, input: unknown, type: "CONSUMPTION" | "RETURN") {
    const parsed = materialDispositionSchema.safeParse(input);
    if (!parsed.success) throw new ManufacturingError("INVALID_INPUT", parsed.error.message);
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: materialId } });
      if (!material || material.manufacturingOrderId !== orderId) throw new ManufacturingError("NOT_FOUND", "Manufacturing material not found");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const existingKeys = type === "RETURN" ? [parsed.data.idempotencyKey, `${parsed.data.idempotencyKey}:source`] : [parsed.data.idempotencyKey];
      const existing = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: existingKeys } } });
      if (existing.length > 0) {
        if (order.status !== "RELEASED" && order.status !== "IN_PROGRESS" && order.status !== "QC_PENDING" && order.status !== "COMPLETED") throw new ManufacturingError("INVALID_STATE", "Material disposition retry is not valid for this order status");
        const primaryType = type === "CONSUMPTION" ? "CONSUMPTION" : "RETURN";
        const expectedCount = type === "CONSUMPTION" ? 1 : 2;
        const primary = existing.find((entry) => entry.idempotencyKey === parsed.data.idempotencyKey);
        const source = type === "RETURN" ? existing.find((entry) => entry.idempotencyKey === `${parsed.data.idempotencyKey}:source`) : undefined;
        const validPrimary = !!primary && primary.movementType === primaryType && primary.itemId === material.itemId && primary.warehouseId === order.wipWarehouseId && primary.sourceType === "MANUFACTURING_ORDER" && primary.sourceId === `${orderId}:${materialId}` && primary.quantity.equals(quantity);
        const validSource = type === "CONSUMPTION" || (!!source && source.movementType === "TRANSFER_IN" && source.itemId === material.itemId && source.warehouseId === order.warehouseId && source.sourceType === "MANUFACTURING_ORDER" && source.sourceId === `${orderId}:${materialId}` && source.quantity.equals(quantity));
        if (existing.length !== expectedCount || !validPrimary || !validSource) throw new ManufacturingError("CONFLICT", "Idempotency key belongs to another material disposition");
        return { materialId, movementId: primary!.id, quantity: quantity.toString(), disposition: type };
      }
      if (order.status !== "RELEASED" && order.status !== "IN_PROGRESS" && order.status !== "QC_PENDING") throw new ManufacturingError("INVALID_STATE", "Material disposition requires an active manufacturing order");
      const current = type === "CONSUMPTION" ? material.consumedQty : material.returnedQty;
      const wipRemaining = material.issuedQty.minus(material.consumedQty).minus(material.returnedQty);
      if (current.plus(quantity).greaterThan(material.issuedQty) || quantity.greaterThan(wipRemaining)) throw new ManufacturingError("INVALID_INPUT", "Disposition exceeds remaining WIP material");
      const movement = type === "CONSUMPTION"
        ? await this.inventory.consumeWipMaterial(transaction, { actorId, materialId, manufacturingOrderId: orderId, quantity: parsed.data.quantity, idempotencyKey: parsed.data.idempotencyKey })
        : await this.inventory.returnWipMaterial(transaction, { actorId, materialId, manufacturingOrderId: orderId, quantity: parsed.data.quantity, idempotencyKey: parsed.data.idempotencyKey });
      const updated = await transaction.manufacturingOrderMaterial.updateMany({ where: { id: materialId, consumedQty: material.consumedQty, returnedQty: material.returnedQty }, data: type === "CONSUMPTION" ? { consumedQty: { increment: quantity } } : { returnedQty: { increment: quantity } } });
      if (updated.count !== 1) throw new ManufacturingError("CONFLICT", "Material disposition changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: `manufacturing_order.material_${type.toLowerCase()}`, entityType: "ManufacturingOrderMaterial", entityId: materialId, source: "manufacturing", metadata: { manufacturingOrderId: orderId, quantity: parsed.data.quantity, movementId: movement.id } } });
      return { materialId, movementId: movement.id, quantity: quantity.toString(), disposition: type };
    });
  }

  async get(orderId: string) {
    const order = await this.prisma.manufacturingOrder.findUnique({
      where: { id: orderId },
      include: {
        item: { select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } } },
        warehouse: { select: { id: true, code: true, name: true } },
        wipWarehouse: { select: { id: true, code: true, name: true } },
        materials: {
          orderBy: { sequence: "asc" },
          include: { item: { select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } } } },
        },
        workOrders: { select: { id: true, number: true, status: true } },
      },
    });
    if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
    return order;
  }

  async list(input: unknown) {
    const parsed = manufacturingOrderListSchema.safeParse(input);
    if (!parsed.success) throw new ManufacturingError("INVALID_INPUT", parsed.error.message);
    const { status, limit, offset } = parsed.data;
    const where: Prisma.ManufacturingOrderWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.manufacturingOrder.findMany({ where, take: limit, skip: offset, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { item: { select: { sku: true, name: true } }, _count: { select: { materials: true, workOrders: true } } } }),
      this.prisma.manufacturingOrder.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }
}
