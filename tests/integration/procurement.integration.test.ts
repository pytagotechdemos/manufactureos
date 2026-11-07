import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ProcurementError, ProcurementService } from "@/modules/procurement/application/procurement-service";

const suite = process.env.RUN_DB_INTEGRATION === "true" ? describe : describe.skip;
let prisma: PrismaClient;
let procurement: ProcurementService;
let actorId: string;
let itemId: string;
let uomId: string;
let categoryId: string;
let supplierId: string;
let warehouseId: string;

suite("Procurement PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    procurement = new ProcurementService(prisma);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    actorId = randomUUID();
    itemId = randomUUID();
    uomId = randomUUID();
    categoryId = randomUUID();
    supplierId = randomUUID();
    warehouseId = randomUUID();
    await prisma.user.create({ data: { id: actorId, name: "Procurement Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" } });
    await prisma.itemCategory.create({ data: { id: categoryId, code: `PO-CAT-${suffix}`, name: "Procurement Test" } });
    await prisma.unitOfMeasure.create({ data: { id: uomId, code: `PO-EA-${suffix}`, name: "Each", dimension: "COUNT", precision: 0 } });
    await prisma.item.create({ data: { id: itemId, sku: `PO-${suffix}`, name: "Procurement Fixture", categoryId, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: uomId } });
    await prisma.supplier.create({ data: { id: supplierId, code: `SUP-${suffix}`, name: "Test Supplier" } });
    await prisma.warehouse.create({ data: { id: warehouseId, code: `PO-WH-${suffix}`, name: "Receiving Warehouse" } });
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it("approves PO, posts partial receipts into inventory, prevents over-receipt, and is idempotent", async () => {
    const request = await procurement.createPurchaseRequest(actorId, {
      number: `PR-${randomUUID().slice(0, 8)}`,
      supplierId,
      lines: [{ itemId, quantity: "10", uomId }],
    });
    const requestLine = request.lines[0];
    if (!requestLine) throw new Error("Missing purchase request line");
    await procurement.approvePurchaseRequest(actorId, request.id);

    const order = await procurement.createPurchaseOrder(actorId, {
      number: `PO-${randomUUID().slice(0, 8)}`,
      supplierId,
      warehouseId,
      lines: [{ itemId, quantity: "10", unitCost: "125.50", uomId, requestLineId: requestLine.id, requestQuantity: "10" }],
    });
    expect(await prisma.purchaseRequestAllocation.count({ where: { requestLineId: requestLine.id } })).toBe(1);
    await expect(procurement.createPurchaseOrder(actorId, {
      number: `PO-${randomUUID().slice(0, 8)}`,
      supplierId,
      warehouseId,
      lines: [{ itemId, quantity: "1", unitCost: "125.50", uomId, requestLineId: requestLine.id, requestQuantity: "1" }],
    })).rejects.toMatchObject({ code: "CONFLICT" });
    const approved = await procurement.approvePurchaseOrder(actorId, order.id);
    expect(approved.status).toBe("APPROVED");
    const orderLine = order.lines[0];
    if (!orderLine) throw new Error("Missing purchase order line");

    const firstReceipt = await procurement.createGoodsReceipt(actorId, {
      number: `GR-${randomUUID().slice(0, 8)}`,
      purchaseOrderId: order.id,
      warehouseId,
      idempotencyKey: `gr-${randomUUID()}`,
      lines: [{ purchaseOrderLineId: orderLine.id, quantity: "4" }],
    });
    const posted = await procurement.postGoodsReceipt(actorId, firstReceipt.id);
    expect(posted.status).toBe("POSTED");
    const repeated = await procurement.postGoodsReceipt(actorId, firstReceipt.id);
    expect(repeated.id).toBe(posted.id);
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId } } }))?.onHand.toString()).toBe("4");
    await expect(procurement.createGoodsReceipt(actorId, {
      number: `GR-${randomUUID().slice(0, 8)}`,
      purchaseOrderId: order.id,
      warehouseId,
      idempotencyKey: `gr-${randomUUID()}`,
      lines: [{ purchaseOrderLineId: orderLine.id, quantity: "7" }],
    })).rejects.toMatchObject<Partial<ProcurementError>>({ code: "OVER_RECEIPT" });

    const secondReceipt = await procurement.createGoodsReceipt(actorId, {
      number: `GR-${randomUUID().slice(0, 8)}`,
      purchaseOrderId: order.id,
      warehouseId,
      idempotencyKey: `gr-${randomUUID()}`,
      lines: [{ purchaseOrderLineId: orderLine.id, quantity: "6" }],
    });
    const secondPosted = await procurement.postGoodsReceipt(actorId, secondReceipt.id);
    expect(secondPosted.status).toBe("POSTED");
    expect((await prisma.purchaseOrder.findUnique({ where: { id: order.id } }))?.status).toBe("FULLY_RECEIVED");
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId } } }))?.onHand.toString()).toBe("10");

    await expect(procurement.createGoodsReceipt(actorId, {
      number: `GR-${randomUUID().slice(0, 8)}`,
      purchaseOrderId: order.id,
      warehouseId,
      idempotencyKey: `gr-${randomUUID()}`,
      lines: [{ purchaseOrderLineId: orderLine.id, quantity: "1" }],
    })).rejects.toMatchObject<Partial<ProcurementError>>({ code: "INVALID_STATE" });
  });
});
