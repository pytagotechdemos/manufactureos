import "server-only";
import Decimal from "decimal.js";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import { applyValuedIssue, applyValuedReceipt, type ValuationBalance, type ValuationResult } from "@/modules/costing/domain/moving-average";

const positiveDecimal = z.string().trim().regex(/^\d+(\.\d+)?$/).refine((value) => new Decimal(value).greaterThan(0));
const stockInputSchema = z.object({
  itemId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: positiveDecimal,
  sourceType: z.string().trim().min(1).max(50),
  sourceId: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(120),
  unitCost: z.string().trim().regex(/^\d+(\.\d+)?$/).optional(),
});

const transferSchema = z.object({
  itemId: z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  quantity: positiveDecimal,
  sourceType: z.string().trim().min(1).max(50),
  sourceId: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(120),
}).refine((value) => value.fromWarehouseId !== value.toWarehouseId, "Transfer warehouses must differ");

const adjustmentSchema = stockInputSchema.extend({
  direction: z.enum(["INCREASE", "DECREASE"]),
});

const blockSchema = stockInputSchema.extend({
  action: z.enum(["BLOCK", "UNBLOCK"]),
});

export class InventoryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INSUFFICIENT_STOCK" | "CONFLICT", message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

async function serializableTransaction<T>(prisma: PrismaClient, operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

type BalanceValuationRow = { onHand: Prisma.Decimal; onHandValue: Prisma.Decimal; averageUnitCost: Prisma.Decimal | null; valuationComplete: boolean };

function valuationBalance(balance: BalanceValuationRow): ValuationBalance {
  return { onHand: balance.onHand.toString(), onHandValue: balance.onHandValue.toString(), averageUnitCost: balance.averageUnitCost?.toString() ?? null, valuationComplete: balance.valuationComplete };
}

async function updateValuation(transaction: Prisma.TransactionClient, itemId: string, warehouseId: string, result: ValuationResult) {
  await transaction.stockBalance.update({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    data: {
      onHand: new Prisma.Decimal(result.balance.onHand),
      onHandValue: new Prisma.Decimal(result.balance.onHandValue),
      averageUnitCost: result.balance.averageUnitCost === null ? null : new Prisma.Decimal(result.balance.averageUnitCost),
      valuationComplete: result.balance.valuationComplete,
    },
  });
}

function assertSamePayload(existing: { itemId: string; warehouseId: string; quantity: Prisma.Decimal; sourceType: string; sourceId: string }, input: z.infer<typeof stockInputSchema>) {
  if (
    existing.itemId !== input.itemId ||
    existing.warehouseId !== input.warehouseId ||
    !existing.quantity.equals(input.quantity) ||
    existing.sourceType !== input.sourceType ||
    existing.sourceId !== input.sourceId
  ) {
    throw new InventoryError("CONFLICT", "Idempotency key was previously used with different transaction data");
  }
}

export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveForManufacturingMaterial(
    transaction: Prisma.TransactionClient,
    input: { actorId: string; itemId: string; warehouseId: string; quantity: string; manufacturingOrderId: string; materialId: string },
  ) {
    const idempotencyKey = `mo-reserve:${input.materialId}`;
    const existing = await transaction.stockReservation.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.itemId !== input.itemId || existing.warehouseId !== input.warehouseId || existing.sourceId !== input.manufacturingOrderId || !existing.quantity.equals(input.quantity)) {
        throw new InventoryError("CONFLICT", "Manufacturing material reservation conflicts with existing reservation");
      }
      if (existing.status !== "ACTIVE") throw new InventoryError("CONFLICT", "Manufacturing material reservation is not active");
      return existing;
    }
    await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } }, create: { itemId: input.itemId, warehouseId: input.warehouseId }, update: {} });
    const quantity = new Prisma.Decimal(input.quantity);
    const updated = await transaction.$executeRaw`UPDATE "StockBalance" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = NOW() WHERE "itemId" = ${input.itemId}::uuid AND "warehouseId" = ${input.warehouseId}::uuid AND "onHand" - "reserved" - "blocked" >= ${quantity}`;
    if (updated !== 1) throw new InventoryError("INSUFFICIENT_STOCK", "Insufficient available stock to release manufacturing order");
    const reservation = await transaction.stockReservation.create({ data: { idempotencyKey, sourceType: "MANUFACTURING_ORDER", sourceId: input.manufacturingOrderId, itemId: input.itemId, warehouseId: input.warehouseId, quantity, actorId: input.actorId } });
    await transaction.auditLog.create({ data: { actorId: input.actorId, action: "inventory.manufacturing_material.reserved", entityType: "StockReservation", entityId: reservation.id, source: "MANUFACTURING_ORDER", metadata: { manufacturingOrderId: input.manufacturingOrderId, materialId: input.materialId, itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity } } });
    return reservation;
  }

  async consumeWipMaterial(transaction: Prisma.TransactionClient, input: { actorId: string; materialId: string; manufacturingOrderId: string; quantity: string; idempotencyKey: string }) {
    const movement = await this.getMaterialMovementPair(transaction, input, "CONSUMPTION");
    if (movement) return movement;
    const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: input.materialId }, include: { manufacturingOrder: true } });
    if (!material || material.manufacturingOrderId !== input.manufacturingOrderId) throw new InventoryError("NOT_FOUND", "Manufacturing order material not found");
    const quantity = new Prisma.Decimal(input.quantity);
    const wipQuantity = material.issuedQty.minus(material.consumedQty).minus(material.returnedQty);
    if (!quantity.greaterThan(0) || quantity.greaterThan(wipQuantity)) throw new InventoryError("INSUFFICIENT_STOCK", "Consumption exceeds available WIP quantity");
    const wipBalance = await transaction.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId } } });
    if (!wipBalance || wipBalance.onHand.lessThan(quantity)) throw new InventoryError("CONFLICT", "WIP balance is inconsistent");
    const valuation = applyValuedIssue(valuationBalance(wipBalance), input.quantity);
    await updateValuation(transaction, material.itemId, material.manufacturingOrder.wipWarehouseId, valuation);
    const created = await transaction.stockMovement.create({ data: { idempotencyKey: input.idempotencyKey, sourceType: "MANUFACTURING_ORDER", sourceId: `${input.manufacturingOrderId}:${input.materialId}`, itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId, movementType: "CONSUMPTION", quantity, unitCost: valuation.movementUnitCost ? new Prisma.Decimal(valuation.movementUnitCost) : undefined, costStatus: valuation.costStatus, actorId: input.actorId } });
    return created;
  }

  async returnWipMaterial(transaction: Prisma.TransactionClient, input: { actorId: string; materialId: string; manufacturingOrderId: string; quantity: string; idempotencyKey: string }) {
    const movement = await this.getMaterialMovementPair(transaction, input, "RETURN");
    if (movement) return movement;
    const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: input.materialId }, include: { manufacturingOrder: true } });
    if (!material || material.manufacturingOrderId !== input.manufacturingOrderId) throw new InventoryError("NOT_FOUND", "Manufacturing order material not found");
    const quantity = new Prisma.Decimal(input.quantity);
    const wipQuantity = material.issuedQty.minus(material.consumedQty).minus(material.returnedQty);
    if (!quantity.greaterThan(0) || quantity.greaterThan(wipQuantity)) throw new InventoryError("INSUFFICIENT_STOCK", "Return exceeds available WIP quantity");
    const sourceKey = `${input.idempotencyKey}:source`;
    const wipBalance = await transaction.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId } } });
    if (!wipBalance || wipBalance.onHand.lessThan(quantity)) throw new InventoryError("CONFLICT", "WIP balance is inconsistent");
    const sourceBalance = await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: material.manufacturingOrder.warehouseId } }, create: { itemId: material.itemId, warehouseId: material.manufacturingOrder.warehouseId }, update: {} });
    const outboundValuation = applyValuedIssue(valuationBalance(wipBalance), input.quantity);
    const inboundValuation = applyValuedReceipt(valuationBalance(sourceBalance), input.quantity, outboundValuation.movementUnitCost);
    await updateValuation(transaction, material.itemId, material.manufacturingOrder.wipWarehouseId, outboundValuation);
    await updateValuation(transaction, material.itemId, material.manufacturingOrder.warehouseId, inboundValuation);
    const returned = await transaction.stockMovement.create({ data: { idempotencyKey: input.idempotencyKey, sourceType: "MANUFACTURING_ORDER", sourceId: `${input.manufacturingOrderId}:${input.materialId}`, itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId, movementType: "RETURN", quantity, unitCost: outboundValuation.movementUnitCost ? new Prisma.Decimal(outboundValuation.movementUnitCost) : undefined, costStatus: outboundValuation.costStatus, actorId: input.actorId } });
    await transaction.stockMovement.create({ data: { idempotencyKey: sourceKey, sourceType: "MANUFACTURING_ORDER", sourceId: `${input.manufacturingOrderId}:${input.materialId}`, itemId: material.itemId, warehouseId: material.manufacturingOrder.warehouseId, movementType: "TRANSFER_IN", quantity, unitCost: outboundValuation.movementUnitCost ? new Prisma.Decimal(outboundValuation.movementUnitCost) : undefined, costStatus: outboundValuation.costStatus, actorId: input.actorId } });
    return returned;
  }

  private async getMaterialMovementPair(transaction: Prisma.TransactionClient, input: { materialId: string; idempotencyKey: string }, movementType: "CONSUMPTION" | "RETURN") {
    const keys = movementType === "RETURN" ? [input.idempotencyKey, `${input.idempotencyKey}:source`] : [input.idempotencyKey];
    const existing = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: keys } } });
    if (existing.length === 0) return null;
    if ((movementType === "RETURN" && existing.length !== 2) || (movementType === "CONSUMPTION" && existing.length !== 1) || existing[0]?.movementType !== movementType) throw new InventoryError("CONFLICT", "Idempotency key conflicts with an existing material disposition");
    return existing[0];
  }

  async issueReservedManufacturingMaterial(
    transaction: Prisma.TransactionClient,
    input: { actorId: string; materialId: string; manufacturingOrderId: string; quantity: string; idempotencyKey: string },
  ) {
    const movementSourceId = `${input.manufacturingOrderId}:${input.materialId}`;
    const outboundKey = `${input.idempotencyKey}:out`;
    const inboundKey = `${input.idempotencyKey}:in`;
    const existing = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: [outboundKey, inboundKey] } } });
    if (existing.length > 0) {
      if (existing.length !== 2 || existing.some((movement) => movement.sourceType !== "MANUFACTURING_ORDER" || movement.sourceId !== movementSourceId || !movement.quantity.equals(input.quantity))) throw new InventoryError("CONFLICT", "Issue idempotency key conflicts with an existing transfer");
      return existing.find((movement) => movement.movementType === "TRANSFER_OUT")!;
    }
    const material = await transaction.manufacturingOrderMaterial.findUnique({ where: { id: input.materialId }, include: { manufacturingOrder: true, reservation: true } });
    if (!material || material.manufacturingOrderId !== input.manufacturingOrderId) throw new InventoryError("NOT_FOUND", "Manufacturing order material not found");
    const reservation = material.reservation;
    if (!reservation || reservation.status !== "ACTIVE") throw new InventoryError("CONFLICT", "Active material reservation not found");
    if (reservation.warehouseId === material.manufacturingOrder.wipWarehouseId) throw new InventoryError("INVALID_INPUT", "Source and WIP warehouses must differ");
    const quantity = new Prisma.Decimal(input.quantity);
    const remainingReservation = reservation.quantity.minus(reservation.consumedQty);
    if (!quantity.greaterThan(0) || quantity.greaterThan(remainingReservation)) throw new InventoryError("INSUFFICIENT_STOCK", "Issue quantity exceeds active reservation");
    await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId } }, create: { itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId }, update: {} });
    const sourceBalance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: reservation.warehouseId } } });
    const wipBalance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId } } });
    if (sourceBalance.onHand.minus(sourceBalance.reserved).minus(sourceBalance.blocked).lessThan(quantity)) throw new InventoryError("CONFLICT", "Source stock balance is inconsistent with active reservation");
    const sourceValuation = applyValuedIssue(valuationBalance(sourceBalance), input.quantity);
    const wipValuation = applyValuedReceipt(valuationBalance(wipBalance), input.quantity, sourceValuation.movementUnitCost);
    await updateValuation(transaction, material.itemId, reservation.warehouseId, sourceValuation);
    await transaction.stockBalance.update({ where: { itemId_warehouseId: { itemId: material.itemId, warehouseId: reservation.warehouseId } }, data: { reserved: { decrement: quantity } } });
    await updateValuation(transaction, material.itemId, material.manufacturingOrder.wipWarehouseId, wipValuation);
    const remaining = remainingReservation.minus(quantity);
    await transaction.stockReservation.update({ where: { id: reservation.id }, data: { consumedQty: { increment: quantity }, ...(remaining.isZero() ? { status: "CONSUMED" } : {}) } });
    const [outbound, inbound] = await Promise.all([
      transaction.stockMovement.create({ data: { idempotencyKey: outboundKey, sourceType: "MANUFACTURING_ORDER", sourceId: movementSourceId, itemId: material.itemId, warehouseId: reservation.warehouseId, movementType: "TRANSFER_OUT", quantity, unitCost: sourceValuation.movementUnitCost ? new Prisma.Decimal(sourceValuation.movementUnitCost) : undefined, costStatus: sourceValuation.costStatus, actorId: input.actorId } }),
      transaction.stockMovement.create({ data: { idempotencyKey: inboundKey, sourceType: "MANUFACTURING_ORDER", sourceId: movementSourceId, itemId: material.itemId, warehouseId: material.manufacturingOrder.wipWarehouseId, movementType: "TRANSFER_IN", quantity, unitCost: sourceValuation.movementUnitCost ? new Prisma.Decimal(sourceValuation.movementUnitCost) : undefined, costStatus: sourceValuation.costStatus, actorId: input.actorId } }),
    ]);
    await transaction.auditLog.create({ data: { actorId: input.actorId, action: "inventory.manufacturing_material.moved_to_wip", entityType: "StockMovement", entityId: outbound.id, source: "MANUFACTURING_ORDER", metadata: { manufacturingOrderId: input.manufacturingOrderId, materialId: input.materialId, quantity: input.quantity, sourceWarehouseId: reservation.warehouseId, wipWarehouseId: material.manufacturingOrder.wipWarehouseId, transferInId: inbound.id } } });
    return outbound;
  }

  async postProductionReceiptMovement(transaction: Prisma.TransactionClient, input: { actorId: string; itemId: string; warehouseId: string; quantity: string; receiptId: string; receiptNumber: string; idempotencyKey: string }) {
    const existing = await transaction.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.itemId !== input.itemId || existing.warehouseId !== input.warehouseId || !existing.quantity.equals(input.quantity) || existing.movementType !== "PRODUCTION_RECEIPT" || existing.sourceId !== input.receiptId) throw new InventoryError("CONFLICT", "Production receipt idempotency conflict");
      return existing;
    }
    await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } }, create: { itemId: input.itemId, warehouseId: input.warehouseId }, update: {} });
    const quantity = new Prisma.Decimal(input.quantity);
    const balance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } } });
    const valuation = applyValuedReceipt(valuationBalance(balance), input.quantity, null);
    await updateValuation(transaction, input.itemId, input.warehouseId, valuation);
    const movement = await transaction.stockMovement.create({ data: { idempotencyKey: input.idempotencyKey, sourceType: "PRODUCTION_RECEIPT", sourceId: input.receiptId, itemId: input.itemId, warehouseId: input.warehouseId, movementType: "PRODUCTION_RECEIPT", quantity, costStatus: valuation.costStatus, actorId: input.actorId } });
    await transaction.auditLog.create({ data: { actorId: input.actorId, action: "inventory.production_receipt.posted", entityType: "StockMovement", entityId: movement.id, source: "PRODUCTION_RECEIPT", metadata: { receiptId: input.receiptId, receiptNumber: input.receiptNumber, itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity } } });
    return movement;
  }

  async postGoodsReceiptMovement(
    transaction: Prisma.TransactionClient,
    input: {
      actorId: string;
      itemId: string;
      warehouseId: string;
      quantity: string;
      unitCost: string;
      idempotencyKey: string;
      receiptId: string;
      receiptNumber: string;
    },
  ) {
    const existing = await transaction.stockMovement.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.itemId !== input.itemId || existing.warehouseId !== input.warehouseId || !existing.quantity.equals(input.quantity) || existing.sourceType !== "GOODS_RECEIPT" || existing.sourceId !== input.receiptId || existing.movementType !== "RECEIPT") {
        throw new InventoryError("CONFLICT", "Idempotency key conflicts with a different goods receipt movement");
      }
      return existing;
    }
    await transaction.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } },
      create: { itemId: input.itemId, warehouseId: input.warehouseId },
      update: {},
    });
    const quantity = new Prisma.Decimal(input.quantity);
    const balance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: input.itemId, warehouseId: input.warehouseId } } });
    const valuation = applyValuedReceipt(valuationBalance(balance), input.quantity, input.unitCost);
    await updateValuation(transaction, input.itemId, input.warehouseId, valuation);
    const movement = await transaction.stockMovement.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        sourceType: "GOODS_RECEIPT",
        sourceId: input.receiptId,
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        movementType: "RECEIPT",
        quantity,
        unitCost: valuation.movementUnitCost ? new Prisma.Decimal(valuation.movementUnitCost) : undefined,
        costStatus: valuation.costStatus,
        actorId: input.actorId,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "inventory.goods_receipt.posted",
        entityType: "StockMovement",
        entityId: movement.id,
        source: "GOODS_RECEIPT",
        metadata: { receiptId: input.receiptId, receiptNumber: input.receiptNumber, itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity, unitCost: input.unitCost },
      },
    });
    return movement;
  }

  async balances(filters: { itemId?: string; warehouseId?: string; search?: string }) {
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        ...(filters.itemId ? { itemId: filters.itemId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.search ? { item: { OR: [
          { sku: { contains: filters.search, mode: "insensitive" } },
          { name: { contains: filters.search, mode: "insensitive" } },
        ] } } : {}),
      },
      include: { item: { select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } } }, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: [{ warehouse: { code: "asc" } }, { item: { sku: "asc" } }],
    });
    return balances.map((balance) => ({
      ...balance,
      available: balance.onHand.minus(balance.reserved).minus(balance.blocked),
    }));
  }

  async masterData() {
    const [items, warehouses] = await Promise.all([
      this.prisma.item.findMany({ where: { status: "ACTIVE" }, select: { id: true, sku: true, name: true, baseUom: { select: { code: true } } }, orderBy: { sku: "asc" } }),
      this.prisma.warehouse.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return { items, warehouses };
  }

  async movements(filters: { itemId?: string; warehouseId?: string; limit?: number }) {
    return this.prisma.stockMovement.findMany({
      where: {
        ...(filters.itemId ? { itemId: filters.itemId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      take: Math.min(Math.max(filters.limit ?? 50, 1), 100),
      orderBy: { postedAt: "desc" },
      include: { item: { select: { sku: true, name: true } }, warehouse: { select: { code: true, name: true } } },
    });
  }

  async receive(actorId: string, input: unknown) {
    return this.postMovement(actorId, input, "RECEIPT");
  }

  async issue(actorId: string, input: unknown) {
    return this.postMovement(actorId, input, "ISSUE");
  }

  private async postMovement(actorId: string, input: unknown, movementType: "RECEIPT" | "ISSUE") {
    const parsed = stockInputSchema.safeParse(input);
    if (!parsed.success) throw new InventoryError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;

    return serializableTransaction(this.prisma, async (transaction) => {
      const duplicate = await transaction.stockMovement.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
      if (duplicate) {
        assertSamePayload(duplicate, value);
        if (duplicate.movementType !== movementType) throw new InventoryError("CONFLICT", "Idempotency key belongs to a different movement type");
        return duplicate;
      }

      const [item, warehouse] = await Promise.all([
        transaction.item.findFirst({ where: { id: value.itemId, status: "ACTIVE" }, select: { id: true } }),
        transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } }),
      ]);
      if (!item || !warehouse) throw new InventoryError("INVALID_INPUT", "Item and warehouse must be active");

      await transaction.stockBalance.upsert({
        where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } },
        create: { itemId: value.itemId, warehouseId: value.warehouseId },
        update: {},
      });

      const quantity = new Prisma.Decimal(value.quantity);
      const balance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } } });
      let valuation: ValuationResult;
      if (movementType === "RECEIPT") {
        valuation = applyValuedReceipt(valuationBalance(balance), value.quantity, value.unitCost ?? null);
      } else {
        const available = balance.onHand.minus(balance.reserved).minus(balance.blocked);
        if (quantity.greaterThan(available)) throw new InventoryError("INSUFFICIENT_STOCK", "Available stock is insufficient");
        valuation = applyValuedIssue(valuationBalance(balance), value.quantity);
      }
      await updateValuation(transaction, value.itemId, value.warehouseId, valuation);

      const movement = await transaction.stockMovement.create({
        data: {
          idempotencyKey: value.idempotencyKey,
          sourceType: value.sourceType,
          sourceId: value.sourceId,
          itemId: value.itemId,
          warehouseId: value.warehouseId,
          movementType,
          quantity,
          unitCost: valuation.movementUnitCost ? new Prisma.Decimal(valuation.movementUnitCost) : undefined,
          costStatus: valuation.costStatus,
          actorId,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: `inventory.${movementType.toLowerCase()}.posted`,
          entityType: "StockMovement",
          entityId: movement.id,
          source: value.sourceType,
          metadata: { itemId: value.itemId, warehouseId: value.warehouseId, quantity: value.quantity, sourceId: value.sourceId },
        },
      });
      return movement;
    });
  }

  async transfer(actorId: string, input: unknown) {
    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) throw new InventoryError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    const outboundKey = `${value.idempotencyKey}:out`;
    const inboundKey = `${value.idempotencyKey}:in`;

    return serializableTransaction(this.prisma, async (transaction) => {
      const existing = await transaction.stockMovement.findMany({ where: { idempotencyKey: { in: [outboundKey, inboundKey] } } });
      if (existing.length > 0) {
        if (existing.length !== 2) throw new InventoryError("CONFLICT", "Transfer is only partially recorded");
        for (const movement of existing) {
          const expectedWarehouse = movement.movementType === "TRANSFER_OUT" ? value.fromWarehouseId : value.toWarehouseId;
          if (movement.itemId !== value.itemId || movement.warehouseId !== expectedWarehouse || !movement.quantity.equals(value.quantity) || movement.sourceType !== value.sourceType || movement.sourceId !== value.sourceId) {
            throw new InventoryError("CONFLICT", "Idempotency key was previously used with different transfer data");
          }
        }
        return existing;
      }

      const activeWarehouses = await transaction.warehouse.count({ where: { id: { in: [value.fromWarehouseId, value.toWarehouseId] }, status: "ACTIVE" } });
      const item = await transaction.item.findFirst({ where: { id: value.itemId, status: "ACTIVE" }, select: { id: true } });
      if (!item || activeWarehouses !== 2) throw new InventoryError("INVALID_INPUT", "Item and both warehouses must be active");
      for (const warehouseId of [value.fromWarehouseId, value.toWarehouseId]) {
        await transaction.stockBalance.upsert({
          where: { itemId_warehouseId: { itemId: value.itemId, warehouseId } },
          create: { itemId: value.itemId, warehouseId },
          update: {},
        });
      }

      const quantity = new Prisma.Decimal(value.quantity);
      const sourceBalance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.fromWarehouseId } } });
      const destinationBalance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.toWarehouseId } } });
      if (quantity.greaterThan(sourceBalance.onHand.minus(sourceBalance.reserved).minus(sourceBalance.blocked))) throw new InventoryError("INSUFFICIENT_STOCK", "Available source stock is insufficient");
      const sourceValuation = applyValuedIssue(valuationBalance(sourceBalance), value.quantity);
      const destinationValuation = applyValuedReceipt(valuationBalance(destinationBalance), value.quantity, sourceValuation.movementUnitCost);
      await updateValuation(transaction, value.itemId, value.fromWarehouseId, sourceValuation);
      await updateValuation(transaction, value.itemId, value.toWarehouseId, destinationValuation);

      const movements = await Promise.all([
        transaction.stockMovement.create({ data: { idempotencyKey: outboundKey, sourceType: value.sourceType, sourceId: value.sourceId, itemId: value.itemId, warehouseId: value.fromWarehouseId, movementType: "TRANSFER_OUT", quantity, unitCost: sourceValuation.movementUnitCost ? new Prisma.Decimal(sourceValuation.movementUnitCost) : undefined, costStatus: sourceValuation.costStatus, actorId } }),
        transaction.stockMovement.create({ data: { idempotencyKey: inboundKey, sourceType: value.sourceType, sourceId: value.sourceId, itemId: value.itemId, warehouseId: value.toWarehouseId, movementType: "TRANSFER_IN", quantity, unitCost: sourceValuation.movementUnitCost ? new Prisma.Decimal(sourceValuation.movementUnitCost) : undefined, costStatus: sourceValuation.costStatus, actorId } }),
      ]);
      await transaction.auditLog.create({ data: { actorId, action: "inventory.transfer.posted", entityType: "StockMovement", entityId: movements[0].id, source: value.sourceType, metadata: { itemId: value.itemId, fromWarehouseId: value.fromWarehouseId, toWarehouseId: value.toWarehouseId, quantity: value.quantity, sourceId: value.sourceId } } });
      return movements;
    });
  }

  async adjust(actorId: string, input: unknown) {
    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) throw new InventoryError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    const movementType = value.direction === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
    return serializableTransaction(this.prisma, async (transaction) => {
      const duplicate = await transaction.stockMovement.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
      if (duplicate) {
        assertSamePayload(duplicate, value);
        if (duplicate.movementType !== movementType) throw new InventoryError("CONFLICT", "Idempotency key belongs to a different adjustment");
        return duplicate;
      }
      const warehouse = await transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } });
      const item = await transaction.item.findFirst({ where: { id: value.itemId, status: "ACTIVE" }, select: { id: true } });
      if (!warehouse || !item) throw new InventoryError("INVALID_INPUT", "Item and warehouse must be active");
      await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } }, create: { itemId: value.itemId, warehouseId: value.warehouseId }, update: {} });
      const quantity = new Prisma.Decimal(value.quantity);
      const balance = await transaction.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } } });
      if (value.direction === "DECREASE" && quantity.greaterThan(balance.onHand.minus(balance.reserved).minus(balance.blocked))) throw new InventoryError("INSUFFICIENT_STOCK", "Available stock is insufficient for adjustment");
      const valuation = value.direction === "INCREASE" ? applyValuedReceipt(valuationBalance(balance), value.quantity, value.unitCost ?? null) : applyValuedIssue(valuationBalance(balance), value.quantity);
      await updateValuation(transaction, value.itemId, value.warehouseId, valuation);
      const movement = await transaction.stockMovement.create({ data: { idempotencyKey: value.idempotencyKey, sourceType: value.sourceType, sourceId: value.sourceId, itemId: value.itemId, warehouseId: value.warehouseId, movementType, quantity, unitCost: valuation.movementUnitCost ? new Prisma.Decimal(valuation.movementUnitCost) : undefined, costStatus: valuation.costStatus, actorId } });
      await transaction.auditLog.create({ data: { actorId, action: `inventory.adjustment.${value.direction.toLowerCase()}`, entityType: "StockMovement", entityId: movement.id, source: value.sourceType, metadata: { itemId: value.itemId, warehouseId: value.warehouseId, quantity: value.quantity, sourceId: value.sourceId } } });
      return movement;
    });
  }

  async setBlocked(actorId: string, input: unknown) {
    const parsed = blockSchema.safeParse(input);
    if (!parsed.success) throw new InventoryError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    return serializableTransaction(this.prisma, async (transaction) => {
      const duplicate = await transaction.stockMovement.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
      const movementType = value.action === "BLOCK" ? "BLOCK" : "UNBLOCK";
      if (duplicate) {
        assertSamePayload(duplicate, value);
        if (duplicate.movementType !== movementType) throw new InventoryError("CONFLICT", "Idempotency key belongs to a different stock disposition");
        return duplicate;
      }
      const warehouse = await transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } });
      const item = await transaction.item.findFirst({ where: { id: value.itemId, status: "ACTIVE" }, select: { id: true } });
      if (!warehouse || !item) throw new InventoryError("INVALID_INPUT", "Item and warehouse must be active");
      await transaction.stockBalance.upsert({ where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } }, create: { itemId: value.itemId, warehouseId: value.warehouseId }, update: {} });
      const quantity = new Prisma.Decimal(value.quantity);
      const changed = value.action === "BLOCK"
        ? await transaction.$executeRaw`UPDATE "StockBalance" SET "blocked" = "blocked" + ${quantity}, "updatedAt" = NOW() WHERE "itemId" = ${value.itemId}::uuid AND "warehouseId" = ${value.warehouseId}::uuid AND "onHand" - "reserved" - "blocked" >= ${quantity}`
        : await transaction.$executeRaw`UPDATE "StockBalance" SET "blocked" = "blocked" - ${quantity}, "updatedAt" = NOW() WHERE "itemId" = ${value.itemId}::uuid AND "warehouseId" = ${value.warehouseId}::uuid AND "blocked" >= ${quantity}`;
      if (changed !== 1) throw new InventoryError("INSUFFICIENT_STOCK", value.action === "BLOCK" ? "Available stock is insufficient to block" : "Blocked stock is insufficient to unblock");
      const movement = await transaction.stockMovement.create({ data: { idempotencyKey: value.idempotencyKey, sourceType: value.sourceType, sourceId: value.sourceId, itemId: value.itemId, warehouseId: value.warehouseId, movementType, quantity, actorId } });
      await transaction.auditLog.create({ data: { actorId, action: `inventory.stock.${value.action.toLowerCase()}`, entityType: "StockMovement", entityId: movement.id, source: value.sourceType, metadata: { itemId: value.itemId, warehouseId: value.warehouseId, quantity: value.quantity, sourceId: value.sourceId } } });
      return movement;
    });
  }

  async reserve(actorId: string, input: unknown) {
    const parsed = stockInputSchema.safeParse(input);
    if (!parsed.success) throw new InventoryError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;

    return serializableTransaction(this.prisma, async (transaction) => {
      const duplicate = await transaction.stockReservation.findUnique({ where: { idempotencyKey: value.idempotencyKey } });
      if (duplicate) {
        assertSamePayload(duplicate, value);
        return duplicate;
      }
      const [item, warehouse] = await Promise.all([
        transaction.item.findFirst({ where: { id: value.itemId, status: "ACTIVE" }, select: { id: true } }),
        transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } }),
      ]);
      if (!item || !warehouse) throw new InventoryError("INVALID_INPUT", "Item and warehouse must be active");
      await transaction.stockBalance.upsert({
        where: { itemId_warehouseId: { itemId: value.itemId, warehouseId: value.warehouseId } },
        create: { itemId: value.itemId, warehouseId: value.warehouseId },
        update: {},
      });
      const quantity = new Prisma.Decimal(value.quantity);
      const changed = await transaction.$executeRaw`UPDATE "StockBalance" SET "reserved" = "reserved" + ${quantity}, "updatedAt" = NOW() WHERE "itemId" = ${value.itemId}::uuid AND "warehouseId" = ${value.warehouseId}::uuid AND "onHand" - "reserved" - "blocked" >= ${quantity}`;
      if (changed !== 1) throw new InventoryError("INSUFFICIENT_STOCK", "Available stock is insufficient for reservation");
      const reservation = await transaction.stockReservation.create({
        data: {
          idempotencyKey: value.idempotencyKey,
          sourceType: value.sourceType,
          sourceId: value.sourceId,
          itemId: value.itemId,
          warehouseId: value.warehouseId,
          quantity,
          actorId,
        },
      });
      await transaction.auditLog.create({
        data: { actorId, action: "inventory.reserved", entityType: "StockReservation", entityId: reservation.id, source: value.sourceType, metadata: { itemId: value.itemId, warehouseId: value.warehouseId, quantity: value.quantity, sourceId: value.sourceId } },
      });
      return reservation;
    });
  }

  async reservations(filters: { itemId?: string; warehouseId?: string; status?: "ACTIVE" | "RELEASED" | "CONSUMED" }) {
    return this.prisma.stockReservation.findMany({
      where: {
        ...(filters.itemId ? { itemId: filters.itemId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { item: { select: { sku: true, name: true } }, warehouse: { select: { code: true, name: true } } },
    });
  }

  async releaseReservation(actorId: string, reservationId: string) {
    return serializableTransaction(this.prisma, async (transaction) => {
      const reservation = await transaction.stockReservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw new InventoryError("NOT_FOUND", "Reservation not found");
      if (reservation.status !== "ACTIVE") throw new InventoryError("CONFLICT", "Only active reservations can be released");
      const remaining = reservation.quantity.minus(reservation.consumedQty);
      const updated = await transaction.stockReservation.updateMany({ where: { id: reservationId, status: "ACTIVE" }, data: { status: "RELEASED" } });
      if (updated.count !== 1) throw new InventoryError("CONFLICT", "Reservation state changed concurrently");
      const balanceUpdated = await transaction.$executeRaw`UPDATE "StockBalance" SET "reserved" = "reserved" - ${remaining}, "updatedAt" = NOW() WHERE "itemId" = ${reservation.itemId}::uuid AND "warehouseId" = ${reservation.warehouseId}::uuid AND "reserved" >= ${remaining}`;
      if (balanceUpdated !== 1) throw new InventoryError("CONFLICT", "Reservation balance is inconsistent");
      await transaction.auditLog.create({ data: { actorId, action: "inventory.reservation.released", entityType: "StockReservation", entityId: reservation.id, source: reservation.sourceType, metadata: { sourceId: reservation.sourceId, quantity: reservation.quantity.toString() } } });
      return { ...reservation, status: "RELEASED" as const };
    });
  }
}
