import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { InventoryService } from "@/modules/inventory/application/inventory-service";
import { normalizeToBaseUom } from "@/modules/engineering/domain/uom-conversion";
import { goodsReceiptCreateSchema, purchaseOrderCreateSchema, purchaseOrderListSchema, purchaseRequestCreateSchema, purchaseRequestListSchema } from "./procurement-validation";

export class ProcurementError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE" | "OVER_RECEIPT" | "CONFLICT", message: string) {
    super(message);
    this.name = "ProcurementError";
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

export class ProcurementService {
  private readonly inventory: InventoryService;

  constructor(private readonly prisma: PrismaClient) {
    this.inventory = new InventoryService(prisma);
  }

  async createPurchaseRequest(actorId: string, input: unknown) {
    const parsed = purchaseRequestCreateSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    try {
      return await serializable(this.prisma, async (transaction) => {
      const itemIds = [...new Set(value.lines.map((line) => line.itemId))];
      const uomIds = [...new Set(value.lines.map((line) => line.uomId))];
      const [items, uoms, conversions, supplier] = await Promise.all([
        transaction.item.findMany({ where: { id: { in: itemIds }, status: "ACTIVE" }, select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
        transaction.unitOfMeasure.findMany({ where: { id: { in: uomIds }, status: "ACTIVE" }, select: { id: true, code: true, dimension: true, precision: true } }),
        transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
        value.supplierId ? transaction.supplier.findFirst({ where: { id: value.supplierId, status: "ACTIVE" }, select: { id: true } }) : Promise.resolve(true),
      ]);
      if (items.length !== itemIds.length || uoms.length !== uomIds.length || !supplier) throw new ProcurementError("INVALID_INPUT", "Request supplier, items and UOMs must be active");
      const itemsById = new Map(items.map((item) => [item.id, item]));
      const uomsById = new Map(uoms.map((uom) => [uom.id, uom]));
      for (const line of value.lines) {
        const item = itemsById.get(line.itemId);
        const uom = uomsById.get(line.uomId);
        if (!item || !uom) throw new ProcurementError("INVALID_INPUT", "Request line item or UOM not found");
        const conversionsForDimension = conversions.filter((entry) => entry.fromUom.dimension === uom.dimension && entry.toUom.dimension === uom.dimension).map((entry) => ({ from: entry.fromUom.code, to: entry.toUom.code, factor: entry.factor.toString() }));
        try {
          normalizeToBaseUom(line.quantity, uom.code, item.baseUom.code, [uom, item.baseUom], conversionsForDimension);
        } catch (error) {
          throw new ProcurementError("INVALID_INPUT", error instanceof Error ? error.message : "Request UOM cannot convert to item base UOM");
        }
      }
      const request = await transaction.purchaseRequest.create({
        data: {
          number: value.number,
          supplierId: value.supplierId,
          requestedById: actorId,
          lines: { create: value.lines.map((line) => ({ itemId: line.itemId, quantity: decimal(line.quantity), uomId: line.uomId, neededBy: line.neededBy, notes: line.notes })) },
        },
        include: { lines: true },
      });
      await transaction.auditLog.create({ data: { actorId, action: "purchase_request.created", entityType: "PurchaseRequest", entityId: request.id, source: "procurement", metadata: { number: request.number, lineCount: request.lines.length } } });
      return request;
    });
    } catch (error) {
      if (error instanceof ProcurementError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProcurementError("CONFLICT", "Purchase request number already exists");
      }
      throw error;
    }
  }

  async approvePurchaseRequest(actorId: string, requestId: string) {
    return serializable(this.prisma, async (transaction) => {
      const request = await transaction.purchaseRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
      if (!request) throw new ProcurementError("NOT_FOUND", "Purchase request not found");
      if (request.status !== "DRAFT") throw new ProcurementError("INVALID_STATE", "Only draft requests can be approved");
      const updated = await transaction.purchaseRequest.updateMany({ where: { id: requestId, status: "DRAFT" }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() } });
      if (updated.count !== 1) throw new ProcurementError("CONFLICT", "Purchase request state changed concurrently");
      await transaction.auditLog.create({ data: { actorId, action: "purchase_request.approved", entityType: "PurchaseRequest", entityId: requestId, source: "procurement", metadata: { number: request.number } } });
      return transaction.purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { lines: true } });
    });
  }

  async cancelPurchaseRequest(actorId: string, requestId: string) {
    return serializable(this.prisma, async (transaction) => {
      const request = await transaction.purchaseRequest.findUnique({
        where: { id: requestId },
        include: { lines: { include: { allocations: { include: { order: true } } } } },
      });
      if (!request) throw new ProcurementError("NOT_FOUND", "Purchase request not found");
      if (request.status !== "DRAFT" && request.status !== "APPROVED") {
        throw new ProcurementError("INVALID_STATE", "Only draft or approved purchase requests can be cancelled");
      }
      const hasActiveAllocations = request.lines.some((l) =>
        l.allocations.some((a) => a.order.status !== "CANCELLED"),
      );
      if (hasActiveAllocations) {
        throw new ProcurementError("INVALID_STATE", "Cannot cancel purchase request with active purchase order allocations");
      }
      await transaction.purchaseRequestAllocation.deleteMany({
        where: { requestLine: { requestId } },
      });
      const updated = await transaction.purchaseRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" },
        include: { lines: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "purchase_request.cancelled",
          entityType: "PurchaseRequest",
          entityId: requestId,
          source: "procurement",
          metadata: { number: request.number },
        },
      });
      return updated;
    });
  }

  async listPurchaseRequests(input: unknown) {
    const parsed = purchaseRequestListSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const { status, limit, offset } = parsed.data;
    const where: Prisma.PurchaseRequestWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          supplier: { select: { code: true, name: true } },
          lines: {
            include: {
              item: { select: { sku: true, name: true, baseUom: { select: { code: true } } } },
              uom: { select: { id: true, code: true, name: true } },
              allocations: true,
            },
          },
        },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async createPurchaseOrder(actorId: string, input: unknown) {
    const parsed = purchaseOrderCreateSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;

    try {
      return await serializable(this.prisma, async (transaction) => {
      const [supplier, warehouse, items, uoms, conversions] = await Promise.all([
        transaction.supplier.findFirst({ where: { id: value.supplierId, status: "ACTIVE" }, select: { id: true } }),
        transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } }),
        transaction.item.findMany({ where: { id: { in: [...new Set(value.lines.map((line) => line.itemId))] }, status: "ACTIVE" }, select: { id: true, baseUom: { select: { code: true, dimension: true, precision: true } } } }),
        transaction.unitOfMeasure.findMany({ where: { id: { in: [...new Set(value.lines.map((line) => line.uomId))] }, status: "ACTIVE" }, select: { id: true, code: true, dimension: true, precision: true } }),
        transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } }),
      ]);
      if (!supplier || !warehouse || items.length !== new Set(value.lines.map((line) => line.itemId)).size || uoms.length !== new Set(value.lines.map((line) => line.uomId)).size) {
        throw new ProcurementError("INVALID_INPUT", "Supplier, warehouse, items, and units must be active");
      }
      const itemsById = new Map(items.map((item) => [item.id, item]));
      const uomsById = new Map(uoms.map((uom) => [uom.id, uom]));
      for (const line of value.lines) {
        const item = itemsById.get(line.itemId);
        const uom = uomsById.get(line.uomId);
        if (!item || !uom) throw new ProcurementError("INVALID_INPUT", "Purchase order references an unknown item or UOM");
        try {
          const conversionsForDimension = conversions
            .filter((conversion) => conversion.fromUom.dimension === uom.dimension && conversion.toUom.dimension === uom.dimension)
            .map((conversion) => ({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString() }));
          normalizeToBaseUom(line.quantity, uom.code, item.baseUom.code, [uom, item.baseUom], conversionsForDimension);
        } catch (error) {
          throw new ProcurementError("INVALID_INPUT", error instanceof Error ? error.message : "Purchase order UOM is not convertible to item base UOM");
        }
      }
      const order = await transaction.purchaseOrder.create({
        data: {
          number: value.number,
          supplierId: value.supplierId,
          warehouseId: value.warehouseId,
          expectedDelivery: value.expectedDelivery,
          lines: {
            create: value.lines.map((line, index) => ({
              itemId: line.itemId,
              sequence: index + 1,
              orderedQty: decimal(line.quantity),
              unitCost: decimal(line.unitCost),
              uomId: line.uomId,
            })),
          },
        },
        include: { lines: true },
      });
      for (const [index, inputLine] of value.lines.entries()) {
        if (!inputLine.requestLineId || !inputLine.requestQuantity) continue;
        const requestLine = await transaction.purchaseRequestLine.findUnique({
          where: { id: inputLine.requestLineId },
          include: {
            request: true,
            item: { include: { baseUom: true } },
            uom: true,
            allocations: true,
          },
        });
        if (!requestLine) throw new ProcurementError("NOT_FOUND", "Purchase request line not found");
        if (requestLine.request.status !== "APPROVED") throw new ProcurementError("INVALID_STATE", "Only approved request lines can be allocated");
        if (requestLine.request.supplierId && requestLine.request.supplierId !== value.supplierId) {
          throw new ProcurementError("INVALID_INPUT", "Purchase request supplier must match the purchase order supplier");
        }
        if (requestLine.itemId !== inputLine.itemId) throw new ProcurementError("INVALID_INPUT", "Purchase request and order line items do not match");
        const allocated = await transaction.purchaseRequestAllocation.aggregate({ where: { requestLineId: requestLine.id }, _sum: { quantity: true } });
        const allocatedQuantity = allocated._sum.quantity ? new Decimal(allocated._sum.quantity.toString()) : new Decimal(0);
        const requestOutstanding = new Decimal(requestLine.quantity.toString()).minus(allocatedQuantity);
        const requestedAllocation = new Decimal(inputLine.requestQuantity);
        if (!requestedAllocation.greaterThan(0)) throw new ProcurementError("INVALID_INPUT", "Allocation quantity must be positive");
        if (requestedAllocation.greaterThan(requestOutstanding)) throw new ProcurementError("CONFLICT", "Allocation exceeds unallocated purchase request quantity");
        const orderLine = order.lines.find((line) => line.sequence === index + 1);
        if (!orderLine) throw new ProcurementError("CONFLICT", "Purchase order line was not created");
        const orderUom = uomsById.get(orderLine.uomId);
        if (!orderUom) throw new ProcurementError("INVALID_INPUT", "Purchase order line UOM was not found");
        const conversionsForDimension = conversions
          .filter((conversion) => conversion.fromUom.dimension === requestLine.uom.dimension && conversion.toUom.dimension === requestLine.uom.dimension)
          .map((conversion) => ({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString() }));
        let requestBaseQuantity: string;
        let orderBaseQuantity: string;
        try {
          requestBaseQuantity = normalizeToBaseUom(inputLine.requestQuantity, requestLine.uom.code, requestLine.item.baseUom.code, [requestLine.uom, requestLine.item.baseUom], conversionsForDimension);
          orderBaseQuantity = normalizeToBaseUom(inputLine.quantity, orderUom.code, requestLine.item.baseUom.code, [orderUom, requestLine.item.baseUom], conversionsForDimension);
        } catch (error) {
          throw new ProcurementError("INVALID_INPUT", error instanceof Error ? error.message : "Request allocation UOM conversion failed");
        }
        if (new Decimal(requestBaseQuantity).greaterThan(orderBaseQuantity)) throw new ProcurementError("INVALID_INPUT", "Request allocation cannot exceed its purchase order line quantity");
        await transaction.purchaseRequestAllocation.create({
          data: { requestLineId: requestLine.id, orderId: order.id, orderLineId: orderLine.id, quantity: decimal(inputLine.requestQuantity) },
        });
      }
      await transaction.auditLog.create({ data: { actorId, action: "purchase_order.created", entityType: "PurchaseOrder", entityId: order.id, source: "procurement", metadata: { number: order.number, lineCount: order.lines.length } } });
      return order;
    });
    } catch (error) {
      if (error instanceof ProcurementError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProcurementError("CONFLICT", "Purchase order number already exists");
      }
      throw error;
    }
  }

  async approvePurchaseOrder(actorId: string, orderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
      if (!order) throw new ProcurementError("NOT_FOUND", "Purchase order not found");
      if (order.status !== "DRAFT") throw new ProcurementError("INVALID_STATE", "Only draft purchase orders can be approved");
      if (order.lines.length === 0) throw new ProcurementError("INVALID_INPUT", "Purchase order needs at least one line");
      const result = await transaction.purchaseOrder.updateMany({ where: { id: orderId, status: "DRAFT" }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date() } });
      if (result.count !== 1) throw new ProcurementError("CONFLICT", "Purchase order state changed concurrently");
      const approved = await transaction.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
      await transaction.auditLog.create({ data: { actorId, action: "purchase_order.approved", entityType: "PurchaseOrder", entityId: orderId, source: "procurement", metadata: { number: order.number } } });
      return approved;
    });
  }

  async cancelPurchaseOrder(actorId: string, orderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { lines: true },
      });
      if (!order) throw new ProcurementError("NOT_FOUND", "Purchase order not found");
      if (order.status !== "DRAFT" && order.status !== "APPROVED") {
        throw new ProcurementError("INVALID_STATE", "Only draft or approved purchase orders can be cancelled");
      }
      const hasReceived = order.lines.some((l) => l.receivedQty.greaterThan(0));
      if (hasReceived) {
        throw new ProcurementError("INVALID_STATE", "Purchase orders with received items cannot be cancelled");
      }
      await transaction.goodsReceiptLine.deleteMany({
        where: { receipt: { orderId, status: "DRAFT" } },
      });
      await transaction.goodsReceipt.deleteMany({
        where: { orderId, status: "DRAFT" },
      });
      await transaction.purchaseRequestAllocation.deleteMany({
        where: { orderId },
      });
      const updated = await transaction.purchaseOrder.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
        include: { lines: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "purchase_order.cancelled",
          entityType: "PurchaseOrder",
          entityId: orderId,
          source: "procurement",
          metadata: { number: order.number },
        },
      });
      return updated;
    });
  }

  async closePurchaseOrder(actorId: string, orderId: string) {
    return serializable(this.prisma, async (transaction) => {
      const order = await transaction.purchaseOrder.findUnique({
        where: { id: orderId },
      });
      if (!order) throw new ProcurementError("NOT_FOUND", "Purchase order not found");
      if (order.status !== "PARTIALLY_RECEIVED" && order.status !== "FULLY_RECEIVED") {
        throw new ProcurementError("INVALID_STATE", "Only partially or fully received purchase orders can be closed");
      }
      const updated = await transaction.purchaseOrder.update({
        where: { id: orderId },
        data: { status: "CLOSED" },
        include: { lines: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "purchase_order.closed",
          entityType: "PurchaseOrder",
          entityId: orderId,
          source: "procurement",
          metadata: { number: order.number },
        },
      });
      return updated;
    });
  }

  async listPurchaseOrders(input: unknown) {
    const parsed = purchaseOrderListSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const { status, limit, offset } = parsed.data;
    const where: Prisma.PurchaseOrderWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({ where, take: limit, skip: offset, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { supplier: { select: { code: true, name: true } }, lines: { include: { item: { select: { sku: true, name: true } } } }, _count: { select: { receipts: true } } } }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    const dataWithTotals = data.map((order) => {
      const totalAmount = order.lines.reduce(
        (sum, line) => sum.plus(line.orderedQty.mul(line.unitCost)),
        new Prisma.Decimal(0),
      );
      return {
        ...order,
        totalAmount: totalAmount.toString(),
      };
    });
    return { data: dataWithTotals, page: { limit, offset, total } };
  }

  async purchaseOrderLines(input: unknown) {
    const parsed = purchaseOrderListSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const { limit, offset } = parsed.data;
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrderLine.findMany({
        orderBy: [{ orderId: "asc" }, { sequence: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
        include: {
          item: { select: { id: true, sku: true, name: true } },
          order: { include: { supplier: { select: { code: true } } } },
        },
      }),
      this.prisma.purchaseOrderLine.count(),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async activeSuppliers() {
    return this.prisma.supplier.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    });
  }

  async listSuppliers() {
    return this.prisma.supplier.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, email: true, phone: true, address: true, status: true, createdAt: true },
    });
  }

  async createSupplier(actorId: string, input: unknown) {
    const schema = z.object({
      code: z.string().trim().min(1).max(30),
      name: z.string().trim().min(1).max(160),
      email: z.string().trim().email().optional().or(z.literal("")),
      phone: z.string().trim().max(30).optional(),
      address: z.string().trim().max(500).optional(),
    });
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const values = parsed.data;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const supplier = await transaction.supplier.create({
          data: {
            code: values.code,
            name: values.name,
            email: values.email || null,
            phone: values.phone || null,
            address: values.address || null,
          },
        });
        await transaction.auditLog.create({
          data: { actorId, action: "supplier.created", entityType: "Supplier", entityId: supplier.id, source: "procurement", metadata: { code: supplier.code, name: supplier.name } },
        });
        return supplier;
      });
    } catch (error) {
      if (error instanceof ProcurementError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProcurementError("INVALID_INPUT", "Supplier code is already in use");
      }
      throw error;
    }
  }

  async setSupplierStatus(actorId: string, supplierId: string, status: "ACTIVE" | "INACTIVE") {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const supplier = await transaction.supplier.update({ where: { id: supplierId }, data: { status } });
        await transaction.auditLog.create({
          data: { actorId, action: status === "ACTIVE" ? "supplier.activated" : "supplier.deactivated", entityType: "Supplier", entityId: supplier.id, source: "procurement", metadata: { code: supplier.code } },
        });
        return supplier;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ProcurementError("NOT_FOUND", "Supplier not found");
      }
      throw error;
    }
  }

  async listGoodsReceipts(input: unknown = {}) {
    const parsed = purchaseOrderListSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const { limit, offset } = parsed.data;
    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        take: limit,
        skip: offset,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          order: { include: { supplier: { select: { code: true, name: true } } } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.goodsReceipt.count(),
    ]);
    return { data, page: { limit, offset, total } };
  }

  async createGoodsReceipt(actorId: string, input: unknown) {
    const parsed = goodsReceiptCreateSchema.safeParse(input);
    if (!parsed.success) throw new ProcurementError("INVALID_INPUT", parsed.error.message);
    const value = parsed.data;
    try {
      return await serializable(this.prisma, async (transaction) => {
        const duplicate = await transaction.goodsReceipt.findUnique({ where: { idempotencyKey: value.idempotencyKey }, include: { lines: true } });
        if (duplicate) {
          const sameHeader = duplicate.number === value.number && duplicate.orderId === value.purchaseOrderId && duplicate.warehouseId === value.warehouseId;
          const sameLines = duplicate.lines.length === value.lines.length && value.lines.every((line) => duplicate.lines.some((stored) => stored.orderLineId === line.purchaseOrderLineId && stored.quantity.equals(line.quantity)));
          if (!sameHeader || !sameLines) throw new ProcurementError("CONFLICT", "Idempotency key already used for another receipt");
          return duplicate;
        }
        const order = await transaction.purchaseOrder.findUnique({ where: { id: value.purchaseOrderId }, include: { lines: true } });
        if (!order) throw new ProcurementError("NOT_FOUND", "Purchase order not found");
        if (order.status !== "APPROVED" && order.status !== "PARTIALLY_RECEIVED") throw new ProcurementError("INVALID_STATE", "Only approved outstanding purchase orders can be received");
        const warehouse = await transaction.warehouse.findFirst({ where: { id: value.warehouseId, status: "ACTIVE" }, select: { id: true } });
        if (!warehouse) throw new ProcurementError("INVALID_INPUT", "Receipt warehouse must be active");
        if (value.warehouseId !== order.warehouseId) throw new ProcurementError("INVALID_INPUT", "Receipt warehouse must match the purchase order warehouse");

        for (const line of value.lines) {
          const orderLine = order.lines.find((candidate) => candidate.id === line.purchaseOrderLineId);
          if (!orderLine) throw new ProcurementError("INVALID_INPUT", "Receipt line does not belong to the purchase order");
          const outstanding = orderLine.orderedQty.minus(orderLine.receivedQty);
          if (!decimal(line.quantity).lessThanOrEqualTo(outstanding)) throw new ProcurementError("OVER_RECEIPT", `Receipt exceeds outstanding quantity on PO line ${orderLine.sequence}`);
        }

        const receipt = await transaction.goodsReceipt.create({
          data: {
            number: value.number,
            orderId: value.purchaseOrderId,
            warehouseId: value.warehouseId,
            idempotencyKey: value.idempotencyKey,
            actorId,
            lines: { create: value.lines.map((line, index) => {
              const orderLine = order.lines.find((candidate) => candidate.id === line.purchaseOrderLineId);
              if (!orderLine) throw new ProcurementError("INVALID_INPUT", "Invalid purchase order line");
              return { orderLineId: orderLine.id, sequence: index + 1, quantity: decimal(line.quantity), unitCost: orderLine.unitCost };
            }) },
          },
          include: { lines: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId,
            action: "goods_receipt.created",
            entityType: "GoodsReceipt",
            entityId: receipt.id,
            source: "procurement",
            metadata: { number: receipt.number, purchaseOrderId: receipt.orderId, warehouseId: receipt.warehouseId, lineCount: receipt.lines.length },
          },
        });
        return receipt;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.goodsReceipt.findUnique({ where: { idempotencyKey: value.idempotencyKey }, include: { lines: true } });
        if (duplicate) {
          const sameHeader = duplicate.number === value.number && duplicate.orderId === value.purchaseOrderId && duplicate.warehouseId === value.warehouseId;
          const sameLines = duplicate.lines.length === value.lines.length && value.lines.every((line) => duplicate.lines.some((stored) => stored.orderLineId === line.purchaseOrderLineId && stored.quantity.equals(line.quantity)));
          if (sameHeader && sameLines) return duplicate;
          throw new ProcurementError("CONFLICT", "Idempotency key already used for another receipt");
        }
        throw new ProcurementError("CONFLICT", "Goods receipt number already exists");
      }
      throw error;
    }
  }

  async postGoodsReceipt(actorId: string, receiptId: string) {
    return serializable(this.prisma, async (transaction) => {
      const receipt = await transaction.goodsReceipt.findUnique({ where: { id: receiptId }, include: { lines: { include: { orderLine: true } }, order: { include: { lines: true } } } });
      if (!receipt) throw new ProcurementError("NOT_FOUND", "Goods receipt not found");
      if (receipt.status === "POSTED") return receipt;
      if (receipt.status !== "DRAFT") throw new ProcurementError("INVALID_STATE", "Only draft receipts can be posted");
      if (receipt.order.status !== "APPROVED" && receipt.order.status !== "PARTIALLY_RECEIVED") throw new ProcurementError("INVALID_STATE", "Purchase order is not receivable");
      if (receipt.warehouseId !== receipt.order.warehouseId) throw new ProcurementError("INVALID_STATE", "Receipt warehouse no longer matches the purchase order warehouse");

      const conversions = await transaction.uomConversion.findMany({ select: { fromUom: { select: { code: true, dimension: true } }, toUom: { select: { code: true, dimension: true } }, factor: true } });
      for (const receiptLine of receipt.lines) {
        const orderLine = await transaction.purchaseOrderLine.findUnique({ where: { id: receiptLine.orderLineId }, include: { item: { include: { baseUom: true } }, uom: true } });
        if (!orderLine || orderLine.orderId !== receipt.orderId) throw new ProcurementError("INVALID_INPUT", "Receipt line does not match its purchase order");
        const outstanding = orderLine.orderedQty.minus(orderLine.receivedQty);
        if (receiptLine.quantity.greaterThan(outstanding)) throw new ProcurementError("OVER_RECEIPT", `Receipt exceeds outstanding quantity on line ${orderLine.sequence}`);
        const sameDimensionConversions = conversions
          .filter((conversion) => conversion.fromUom.dimension === orderLine.uom.dimension && conversion.toUom.dimension === orderLine.uom.dimension)
          .map((conversion) => ({ from: conversion.fromUom.code, to: conversion.toUom.code, factor: conversion.factor.toString() }));
        let baseQuantity: string;
        try {
          baseQuantity = normalizeToBaseUom(receiptLine.quantity.toString(), orderLine.uom.code, orderLine.item.baseUom.code, [orderLine.uom, orderLine.item.baseUom], sameDimensionConversions);
        } catch (error) {
          throw new ProcurementError("INVALID_INPUT", error instanceof Error ? error.message : "Receipt UOM is not convertible to item base UOM");
        }
        const changed = await transaction.purchaseOrderLine.updateMany({
          where: { id: orderLine.id, receivedQty: orderLine.receivedQty },
          data: { receivedQty: { increment: receiptLine.quantity } },
        });
        if (changed.count !== 1) throw new ProcurementError("OVER_RECEIPT", "Purchase order line was received concurrently");
        if (!new Decimal(baseQuantity).greaterThan(0)) throw new ProcurementError("INVALID_INPUT", "Receipt quantity rounds to zero in item base UOM");
        const baseCost = new Decimal(receiptLine.unitCost.toString()).mul(new Decimal(receiptLine.quantity.toString())).div(new Decimal(baseQuantity)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString();
        await this.inventory.postGoodsReceiptMovement(transaction, {
          actorId,
          itemId: orderLine.itemId,
          warehouseId: receipt.warehouseId,
          quantity: baseQuantity,
          unitCost: baseCost,
          idempotencyKey: `${receipt.idempotencyKey}:${receiptLine.sequence}`,
          receiptId: receipt.id,
          receiptNumber: receipt.number,
        });
      }

      const refreshedLines = await transaction.purchaseOrderLine.findMany({ where: { orderId: receipt.orderId }, select: { orderedQty: true, receivedQty: true } });
      const allReceived = refreshedLines.every((line) => line.receivedQty.greaterThanOrEqualTo(line.orderedQty));
      const orderStatus = allReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
      await transaction.purchaseOrder.update({ where: { id: receipt.orderId }, data: { status: orderStatus } });
      const posted = await transaction.goodsReceipt.update({ where: { id: receiptId }, data: { status: "POSTED", postedAt: new Date() } });
      await transaction.auditLog.create({ data: { actorId, action: "goods_receipt.posted", entityType: "GoodsReceipt", entityId: receipt.id, source: "procurement", metadata: { number: receipt.number, purchaseOrderId: receipt.orderId, warehouseId: receipt.warehouseId, lineCount: receipt.lines.length } } });
      return posted;
    });
  }

  async cancelGoodsReceipt(actorId: string, receiptId: string) {
    return serializable(this.prisma, async (transaction) => {
      const receipt = await transaction.goodsReceipt.findUnique({
        where: { id: receiptId },
      });
      if (!receipt) throw new ProcurementError("NOT_FOUND", "Goods receipt not found");
      if (receipt.status !== "DRAFT") {
        throw new ProcurementError("INVALID_STATE", "Only draft goods receipts can be cancelled");
      }
      const updated = await transaction.goodsReceipt.update({
        where: { id: receiptId },
        data: { status: "CANCELLED" },
        include: { lines: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: "goods_receipt.cancelled",
          entityType: "GoodsReceipt",
          entityId: receiptId,
          source: "procurement",
          metadata: { number: receipt.number },
        },
      });
      return updated;
    });
  }
}
