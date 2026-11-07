import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { PlanningService } from "@/modules/planning/application/planning-service";
import { ProcurementService } from "@/modules/procurement/application/procurement-service";

const suite = process.env.RUN_DB_INTEGRATION === "true" ? describe : describe.skip;
let prisma: PrismaClient;
let planning: PlanningService;
let procurement: ProcurementService;
let actorId: string;
let itemId: string;
let categoryId: string;
let uomId: string;
let supplierId: string;
let warehouseId: string;

suite("MRP PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    planning = new PlanningService(prisma);
    procurement = new ProcurementService(prisma);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    actorId = randomUUID();
    itemId = randomUUID();
    categoryId = randomUUID();
    uomId = randomUUID();
    supplierId = randomUUID();
    warehouseId = randomUUID();
    await prisma.user.create({ data: { id: actorId, name: "MRP Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" } });
    await prisma.itemCategory.create({ data: { id: categoryId, code: `MRP-CAT-${suffix}`, name: "MRP Test" } });
    await prisma.unitOfMeasure.create({ data: { id: uomId, code: `MRP-EA-${suffix}`, name: "Each", dimension: "COUNT", precision: 0 } });
    await prisma.item.create({ data: { id: itemId, sku: `MRP-${suffix}`, name: "MRP Raw Material", categoryId, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: uomId, safetyStock: "2", purchasingLeadDays: 3, minimumOrderQty: "0", lotSizeMultiple: "0" } });
    await prisma.supplier.create({ data: { id: supplierId, code: `MRP-SUP-${suffix}`, name: "MRP Supplier" } });
    await prisma.warehouse.create({ data: { id: warehouseId, code: `MRP-WH-${suffix}`, name: "MRP Warehouse" } });
    await prisma.stockBalance.create({ data: { itemId, warehouseId, onHand: "3", reserved: "0", blocked: "0" } });
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it("persists a deterministic MRP run and dated recommendation from stock, demand, and PO supply", async () => {
    const demand = await planning.createDemand(actorId, {
      number: `DEM-${randomUUID().slice(0, 8)}`,
      lines: [{ itemId, quantity: "10", requiredDate: "2026-06-10T00:00:00.000Z" }],
    });
    await planning.releaseDemand(actorId, demand.id);

    const order = await procurement.createPurchaseOrder(actorId, {
      number: `PO-MRP-${randomUUID().slice(0, 8)}`,
      supplierId,
      warehouseId,
      expectedDelivery: "2026-06-12T00:00:00.000Z",
      lines: [{ itemId, quantity: "5", unitCost: "100", uomId }],
    });
    await procurement.approvePurchaseOrder(actorId, order.id);

    const first = await planning.runMrp(actorId, { runNumber: `MRP-${randomUUID().slice(0, 8)}`, asOfDate: "2026-06-01T00:00:00.000Z", horizonDays: 30, demandIds: [demand.id] });
    expect(first.recommendations).toHaveLength(1);
    expect(first.recommendations[0]?.quantity.toString()).toBe("9");
    expect(first.recommendations[0]?.requiredDate.toISOString().slice(0, 10)).toBe("2026-06-10");
    expect(first.recommendations[0]?.plannedReleaseDate.toISOString().slice(0, 10)).toBe("2026-06-07");
    expect(first.inputSnapshot).toMatchObject({ asOfDate: "2026-06-01T00:00:00.000Z" });

    const history = await planning.listMrpRuns();
    expect(history.some((run) => run.id === first.id)).toBe(true);
    const detail = await planning.getMrpRun(first.id);
    expect(detail.buckets).toHaveLength(2);
    expect(detail.recommendations).toHaveLength(1);
    expect(detail.recommendations[0]?.sources).toHaveLength(1);
  });
});
