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

async function loadExplosionContext(transaction: Prisma.TransactionClient): Promise<{ catalog: BomCatalog; context: BomExplosionContext; snapshots: unknown[] }> {
  const [boms, items, uoms, conversions] = await Promise.all([
    transaction.bom.findMany({ where: { status: "APPROVED" }, include: { lines: { include: { uom: { select: { code: true } }, component: { select: { supplyType: true } } } } } }),
    transaction.item.findMany({ select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
    transaction.unitOfMeasure.findMany({ where: { status: "ACTIVE" }, select: { code: true, dimension: true, precision: true } }),
    transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
  ]);
  const catalog = new Map<string, BomInput[]>();
  for (const bom of boms) catalog.set(bom.outputItemId, [...(catalog.get(bom.outputItemId) ?? []), bomInput(bom)]);
  const context: BomExplosionContext = {
    itemUnits: new Map(items.map((item) => [item.id, { baseUom: item.baseUom.code, dimension: item.baseUom.dimension, precision: item.baseUom.precision }])),
    uoms: new Map(uoms.map((uom) => [uom.code, uom])),
    conversions: conversions.filter((conversion) => conversion.fromUom.dimension === conversion.toUom.dimension).map((conversion) => ({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString(), dimension: conversion.fromUom.dimension })),
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
    return serializable(this.prisma, async (transaction) => {
      const [recommendation, warehouses] = await Promise.all([
        transaction.mrpRecommendation.findUnique({ where: { id: parsed.data.recommendationId }, include: { item: true } }),
        transaction.warehouse.findMany({ where: { id: { in: [parsed.data.warehouseId, parsed.data.wipWarehouseId] }, status: "ACTIVE" }, select: { id: true, isWip: true } }),
      ]);
      if (!recommendation) throw new ManufacturingError("NOT_FOUND", "MRP recommendation not found");
      const sourceWarehouse = warehouses.find((warehouse) => warehouse.id === parsed.data.warehouseId);
      const wipWarehouse = warehouses.find((warehouse) => warehouse.id === parsed.data.wipWarehouseId);
      if (!sourceWarehouse || !wipWarehouse || !wipWarehouse.isWip || sourceWarehouse.id === wipWarehouse.id) throw new ManufacturingError("INVALID_INPUT", "Select an active source warehouse and a distinct active WIP warehouse");
      if (recommendation.supplyType !== "MAKE" || recommendation.item.supplyType !== "MAKE") throw new ManufacturingError("INVALID_INPUT", "Only MAKE recommendations can create manufacturing orders");
      const existing = await transaction.manufacturingOrder.findFirst({ where: { sourceRecommendationId: recommendation.id } });
      if (existing) throw new ManufacturingError("CONFLICT", "An MO already exists for this recommendation");

      const { catalog, context, snapshots } = await loadExplosionContext(transaction);
      const root = catalog.get(recommendation.itemId)?.find((bom) => {
        const snapshot = snapshots.find((entry) => typeof entry === "object" && entry !== null && "id" in entry && entry.id === bom.bomId) as { effectiveDate: string | null } | undefined;
        return snapshot?.effectiveDate !== null && snapshot?.effectiveDate !== undefined && new Date(snapshot.effectiveDate) <= recommendation.requiredDate;
      });
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

  async issueMaterial(actorId: string, orderId: string, materialId: string, input: unknown) {
    const parsed = materialIssueSchema.safeParse(input);
    if (!parsed.success) throw new ManufacturingError("INVALID_INPUT", parsed.error.message);
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.manufacturingOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new ManufacturingError("NOT_FOUND", "Manufacturing order not found");
      if (order.status !== "RELEASED" && order.status !== "IN_PROGRESS") throw new ManufacturingError("INVALID_STATE", "Materials can only be issued for released or in-progress orders");
      const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: materialId } });
      if (!material || material.manufacturingOrderId !== orderId) throw new ManufacturingError("NOT_FOUND", "Manufacturing material not found");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const existingMovements = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: [`${parsed.data.idempotencyKey}:out`, `${parsed.data.idempotencyKey}:in`] } } });
      if (existingMovements.length > 0) {
        const existingMovement = existingMovements.find((movement) => movement.movementType === "TRANSFER_OUT");
        if (existingMovements.length !== 2 || !existingMovement || existingMovement.itemId !== material.itemId || existingMovement.sourceType !== "MANUFACTURING_ORDER" || existingMovement.sourceId !== `${orderId}:${materialId}` || !existingMovement.quantity.equals(quantity)) {
          throw new ManufacturingError("CONFLICT", "Idempotency key belongs to another material issue");
        }
        return { materialId, movementId: existingMovement.id, issuedQty: material.issuedQty.toString() };
      }
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
      if (order.status !== "RELEASED" && order.status !== "IN_PROGRESS" && order.status !== "QC_PENDING") throw new ManufacturingError("INVALID_STATE", "Material disposition requires an active manufacturing order");
      const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: materialId } });
      if (!material || material.manufacturingOrderId !== orderId) throw new ManufacturingError("NOT_FOUND", "Manufacturing material not found");
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const current = type === "CONSUMPTION" ? material.consumedQty : material.returnedQty;
      const wipRemaining = material.issuedQty.minus(material.consumedQty).minus(material.returnedQty);
      if (current.plus(quantity).greaterThan(material.issuedQty) || quantity.greaterThan(wipRemaining)) throw new ManufacturingError("INVALID_INPUT", "Disposition exceeds remaining WIP material");
      const existingKeys = type === "RETURN" ? [parsed.data.idempotencyKey, `${parsed.data.idempotencyKey}:source`] : [parsed.data.idempotencyKey];
      const existing = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: existingKeys } } });
      if (existing.length > 0) {
        const primaryType = type === "CONSUMPTION" ? "CONSUMPTION" : "RETURN";
        const expectedCount = type === "CONSUMPTION" ? 1 : 2;
        const valid = existing.length === expectedCount && existing.some((entry) => entry.movementType === primaryType) && existing.every((entry) => entry.itemId === material.itemId && entry.sourceType === "MANUFACTURING_ORDER" && entry.sourceId === `${orderId}:${materialId}` && entry.quantity.equals(quantity));
        if (!valid) throw new ManufacturingError("CONFLICT", "Idempotency key belongs to another material disposition");
        return { materialId, movementId: existing.find((entry) => entry.movementType === primaryType)!.id, quantity: quantity.toString(), disposition: type };
      }
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
      this.prisma.manufacturingOrder.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: "desc" }, include: { item: { select: { sku: true, name: true } }, _count: { select: { materials: true, workOrders: true } } } }),
      this.prisma.manufacturingOrder.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }
}
