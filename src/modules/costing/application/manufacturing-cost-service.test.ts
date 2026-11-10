import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { CostingApplicationError, ManufacturingCostService } from "./manufacturing-cost-service";

describe("ManufacturingCostService", () => {
  it("rejects estimating cost for a missing or cancelled order", async () => {
    const prismaMock = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: "mo-1",
          status: "CANCELLED",
          materials: [],
          workOrders: [],
        }),
      },
    } as unknown as PrismaClient;

    const service = new ManufacturingCostService(prismaMock);

    await expect(service.createEstimate("user-1", "mo-missing")).rejects.toThrow(CostingApplicationError);
    await expect(service.createEstimate("user-1", "mo-1")).rejects.toThrow("Cannot estimate cost for a cancelled manufacturing order");
  });

  it("rejects actual costing for orders that are not completed", async () => {
    const prismaMock = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mo-1",
          status: "IN_PROGRESS",
          producedQuantity: new Prisma.Decimal("10"),
          workOrders: [],
        }),
      },
    } as unknown as PrismaClient;

    const service = new ManufacturingCostService(prismaMock);

    await expect(service.createActual("user-1", "mo-1")).rejects.toThrow("Actual cost can only be finalized after the manufacturing order is completed");
  });

  it("computes cost report with variance and period filtering", async () => {
    const prismaMock = {
      manufacturingOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "mo-1",
            number: "MO-001",
            status: "COMPLETED",
            quantity: new Prisma.Decimal("10"),
            producedQuantity: new Prisma.Decimal("10"),
            acceptedQuantity: new Prisma.Decimal("10"),
            createdAt: new Date("2026-11-01T08:00:00Z"),
            item: { sku: "FG-001", name: "Finished Desk" },
            costSnapshots: [
              {
                id: "snap-actual",
                type: "ACTUAL",
                materialCost: new Prisma.Decimal("120"),
                laborCost: new Prisma.Decimal("60"),
                overheadCost: new Prisma.Decimal("20"),
                totalCost: new Prisma.Decimal("200"),
                wipCost: new Prisma.Decimal("0"),
                completedCost: new Prisma.Decimal("200"),
                costPerAcceptedUnit: new Prisma.Decimal("20"),
                valuationComplete: true,
                createdAt: new Date("2026-11-01T12:00:00Z"),
              },
              {
                id: "snap-est",
                type: "ESTIMATE",
                materialCost: new Prisma.Decimal("100"),
                laborCost: new Prisma.Decimal("50"),
                overheadCost: new Prisma.Decimal("0"),
                totalCost: new Prisma.Decimal("150"),
                wipCost: new Prisma.Decimal("0"),
                completedCost: new Prisma.Decimal("150"),
                costPerAcceptedUnit: new Prisma.Decimal("15"),
                valuationComplete: true,
                createdAt: new Date("2026-11-01T08:30:00Z"),
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const service = new ManufacturingCostService(prismaMock);
    const report = await service.getCostReport({ startDate: "2026-11-01", endDate: "2026-11-02", status: "COMPLETED" });

    expect(report).toHaveLength(1);
    expect(report[0]?.moNumber).toBe("MO-001");
    expect(report[0]?.itemSku).toBe("FG-001");
    expect(report[0]?.estimatedCost).toBe(150);
    expect(report[0]?.actualCost).toBe(200);
    expect(report[0]?.variance).toBe(50);
    expect(report[0]?.materialVariance).toBe(20);
    expect(report[0]?.laborVariance).toBe(10);
    expect(report[0]?.overheadVariance).toBe(20);
    expect(report[0]?.actualValuationComplete).toBe(true);
    expect(report[0]?.costPerAcceptedUnit).toBe("20");
  });
});
