import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ManufacturingError, ManufacturingService } from "@/modules/manufacturing/application/manufacturing-service";
import { WorkOrderService } from "@/modules/manufacturing/application/work-order-service";
import { QualityService } from "@/modules/quality/application/quality-service";
import { ManufacturingCostService } from "@/modules/costing/application/manufacturing-cost-service";
import { PlanningService } from "@/modules/planning/application/planning-service";

const suite = process.env.RUN_DB_INTEGRATION === "true" ? describe : describe.skip;
let prisma: PrismaClient;
let planning: PlanningService;
let manufacturing: ManufacturingService;
let workOrders: WorkOrderService;
let quality: QualityService;
let costing: ManufacturingCostService;
let actorId: string;
let categoryId: string;
let eachId: string;
let deskId: string;
let boardId: string;
let warehouseId: string;
let wipWarehouseId: string;
let workCenterId: string;

suite("Manufacturing order PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    planning = new PlanningService(prisma);
    manufacturing = new ManufacturingService(prisma);
    workOrders = new WorkOrderService(prisma);
    quality = new QualityService(prisma);
    costing = new ManufacturingCostService(prisma);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    actorId = randomUUID();
    categoryId = randomUUID();
    eachId = randomUUID();
    deskId = randomUUID();
    boardId = randomUUID();
    warehouseId = randomUUID();
    wipWarehouseId = randomUUID();
    workCenterId = randomUUID();
    await prisma.user.create({ data: { id: actorId, name: "MO Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" } });
    await prisma.itemCategory.create({ data: { id: categoryId, code: `MO-CAT-${suffix}`, name: "MO Test" } });
    await prisma.unitOfMeasure.create({ data: { id: eachId, code: `MO-EA-${suffix}`, name: "Each", dimension: "COUNT", precision: 0 } });
    await prisma.item.createMany({ data: [
      { id: deskId, sku: `MO-DESK-${suffix}`, name: "Test Desk", categoryId, itemType: "FINISHED_GOODS", supplyType: "MAKE", baseUomId: eachId },
      { id: boardId, sku: `MO-BOARD-${suffix}`, name: "Test Board", categoryId, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: eachId, standardMaterialCost: "5" },
    ] });
    await prisma.warehouse.createMany({ data: [
      { id: warehouseId, code: `MO-WH-${suffix}`, name: "MO Test Warehouse", isWip: false },
      { id: wipWarehouseId, code: `MO-WIP-${suffix}`, name: "MO WIP Warehouse", isWip: true },
    ] });
    await prisma.workCenter.create({ data: { id: workCenterId, code: `WC-${suffix}`, name: "Assembly Work Center", hourlyRate: "30", standardMinutes: "30" } });
    await prisma.stockBalance.create({ data: { itemId: boardId, warehouseId, onHand: "20", reserved: "0", blocked: "0" } });
    await prisma.bom.create({
      data: {
        number: `MO-BOM-${suffix}`,
        outputItemId: deskId,
        revision: "A",
        outputQty: "1",
         status: "DRAFT",
         effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
         lines: { create: [{ componentId: boardId, quantity: "2", uomId: eachId, scrapRate: "0.1", sequence: 1 }] },
       },
     });
    await prisma.bom.update({ where: { number: `MO-BOM-${suffix}` }, data: { status: "APPROVED", approvedById: actorId, approvedAt: new Date("2026-06-01T00:00:00.000Z") } });
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it("creates MO from MAKE recommendation with BOM/material snapshots and valid release transitions", async () => {
    const demand = await planning.createDemand(actorId, { number: `MO-DEM-${randomUUID().slice(0, 8)}`, lines: [{ itemId: deskId, quantity: "3", requiredDate: "2026-06-10T00:00:00.000Z" }] });
    await planning.releaseDemand(actorId, demand.id);
    const run = await planning.runMrp(actorId, { runNumber: `MO-MRP-${randomUUID().slice(0, 8)}`, asOfDate: "2026-06-01T00:00:00.000Z", horizonDays: 30, demandIds: [demand.id] });
    const recommendation = run.recommendations.find((entry) => entry.itemId === deskId);
    expect(recommendation).toBeDefined();
    if (!recommendation) throw new Error("Missing MAKE recommendation");

    const order = await manufacturing.createFromRecommendation(actorId, { number: `MO-${randomUUID().slice(0, 8)}`, recommendationId: recommendation.id, warehouseId, wipWarehouseId });
    expect(order.status).toBe("DRAFT");
    expect(order.bomId).toBeTruthy();
    expect(order.materials).toHaveLength(1);
    expect(order.materials[0]?.plannedQty.toString()).toBe("7");
    expect(order.bomSnapshot).toHaveProperty("explosion");

    await expect(manufacturing.release(actorId, order.id)).rejects.toMatchObject<Partial<ManufacturingError>>({ code: "INVALID_STATE" });
    const planned = await manufacturing.plan(actorId, order.id);
    expect(planned.status).toBe("PLANNED");
    const released = await manufacturing.release(actorId, order.id);
    expect(released.status).toBe("RELEASED");
    expect(released.releasedById).toBe(actorId);
    expect(released.workOrders).toHaveLength(1);
    const materialId = released.materials[0]!.id;
    const issueKey = `mo-issue-${randomUUID()}`;
    const firstIssue = await manufacturing.issueMaterial(actorId, order.id, materialId, { quantity: "3", idempotencyKey: issueKey });
    const duplicateIssue = await manufacturing.issueMaterial(actorId, order.id, materialId, { quantity: "3", idempotencyKey: issueKey });
    expect(duplicateIssue.movementId).toBe(firstIssue.movementId);
    await manufacturing.issueMaterial(actorId, order.id, materialId, { quantity: "4", idempotencyKey: `mo-issue-${randomUUID()}` });
    expect((await prisma.manufacturingOrderMaterial.findUnique({ where: { id: materialId } }))?.issuedQty.toString()).toBe("7");
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: boardId, warehouseId } } }))?.onHand.toString()).toBe("13");
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: boardId, warehouseId: wipWarehouseId } } }))?.onHand.toString()).toBe("7");
    const consumeKey = `mo-consume-${randomUUID()}`;
    const consumed = await manufacturing.consumeMaterial(actorId, order.id, materialId, { quantity: "2", idempotencyKey: consumeKey });
    const repeatedConsume = await manufacturing.consumeMaterial(actorId, order.id, materialId, { quantity: "2", idempotencyKey: consumeKey });
    expect(repeatedConsume.movementId).toBe(consumed.movementId);
    await manufacturing.returnMaterial(actorId, order.id, materialId, { quantity: "1", idempotencyKey: `mo-return-${randomUUID()}` });
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: boardId, warehouseId: wipWarehouseId } } }))?.onHand.toString()).toBe("4");
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: boardId, warehouseId } } }))?.onHand.toString()).toBe("14");
    const disposition = await prisma.manufacturingOrderMaterial.findUnique({ where: { id: materialId } });
    expect(disposition?.consumedQty.toString()).toBe("2");
    expect(disposition?.returnedQty.toString()).toBe("1");
    const workOrderId = released.workOrders[0]!.id;
    await workOrders.assignWorkCenter(actorId, workOrderId, { workCenterId });
    const started = await workOrders.start(actorId, workOrderId);
    expect(started.status).toBe("IN_PROGRESS");
    const timeKey = `time-${randomUUID()}`;
    const timeEntry = await workOrders.recordTime(actorId, workOrderId, { minutes: "60", idempotencyKey: timeKey });
    const duplicateTimeEntry = await workOrders.recordTime(actorId, workOrderId, { minutes: "60", idempotencyKey: timeKey });
    expect(duplicateTimeEntry.id).toBe(timeEntry.id);
    expect(timeEntry.hourlyRate.toString()).toBe("30");
    const paused = await workOrders.pause(actorId, workOrderId);
    expect(paused.status).toBe("PAUSED");
    const resumed = await workOrders.start(actorId, workOrderId);
    expect(resumed.status).toBe("IN_PROGRESS");
    const completed = await workOrders.complete(actorId, workOrderId, { completedQty: "2", rejectedQty: "1" });
    expect(completed.status).toBe("COMPLETED");
    expect((await prisma.manufacturingOrder.findUnique({ where: { id: order.id } }))?.status).toBe("QC_PENDING");
    await expect(workOrders.complete(actorId, workOrderId, { completedQty: "1", rejectedQty: "0" })).rejects.toMatchObject({ code: "INVALID_STATE" });

    const inspection = await quality.createInspection(actorId, {
      number: `QC-${randomUUID().slice(0, 8)}`,
      manufacturingOrderId: order.id,
      workOrderId,
      inspectedQty: "3",
      acceptedQty: "2",
      rejectedQty: "0",
      reworkQty: "1",
      defectCode: "REWORK",
      notes: "One unit requires rework",
    });
    await expect(quality.createInspection(actorId, {
      number: `QC-BAD-${randomUUID().slice(0, 8)}`,
      manufacturingOrderId: order.id,
      inspectedQty: "3",
      acceptedQty: "2",
      rejectedQty: "1",
      reworkQty: "1",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await quality.postInspection(actorId, inspection.id);
    const productionReceipt = await quality.postProductionReceipt(actorId, {
      number: `FG-${randomUUID().slice(0, 8)}`,
      manufacturingOrderId: order.id,
      inspectionId: inspection.id,
      warehouseId,
      acceptedQty: "2",
      idempotencyKey: `fg-${randomUUID()}`,
    });
    expect(productionReceipt.status).toBe("POSTED");
    expect((await prisma.stockBalance.findUnique({ where: { itemId_warehouseId: { itemId: deskId, warehouseId } } }))?.onHand.toString()).toBe("2");
    await expect(quality.postProductionReceipt(actorId, {
      number: `FG-OVER-${randomUUID().slice(0, 8)}`,
      manufacturingOrderId: order.id,
      inspectionId: inspection.id,
      warehouseId,
      acceptedQty: "1",
      idempotencyKey: `fg-over-${randomUUID()}`,
    })).rejects.toMatchObject({ code: "INSUFFICIENT_OUTPUT" });

    const reworkInspection = await quality.createInspection(actorId, {
      number: `QC-REW-${randomUUID().slice(0, 8)}`,
      manufacturingOrderId: order.id,
      inspectedQty: "1",
      acceptedQty: "0",
      rejectedQty: "1",
      reworkQty: "0",
      defectCode: "SCRAP",
      notes: "[REWORK] Final scrap disposition",
    });
    await quality.postInspection(actorId, reworkInspection.id);

    const estimate = await costing.createEstimate(actorId, order.id);
    expect(estimate.materialCost.toString()).toBe("35");
    expect(estimate.laborCost.toString()).toBe("15");
    expect(estimate.valuationComplete).toBe(true);
    const actual = await costing.createActual(actorId, order.id);
    expect(actual.laborCost.toString()).toBe("30");
    expect(actual.valuationComplete).toBe(false);
    expect(actual.unvaluedReferences).toMatchObject({ materialMovementIds: expect.any(Array) });
  });
});
