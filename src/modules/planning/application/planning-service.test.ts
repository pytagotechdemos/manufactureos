import { describe, expect, it, vi } from "vitest";
import { PlanningError, PlanningService } from "./planning-service";

describe("PlanningService demand lifecycle operations", () => {
  const actorId = "user-planner-1";
  const demandId = "b0000000-0000-4000-8000-000000000001";
  const itemUuid = "a0000000-0000-4000-8000-000000000001";
  const itemUuid2 = "a0000000-0000-4000-8000-000000000002";

  it("createDemand throws INVALID_INPUT if any demand item is not active", async () => {
    const mockTx = {
      item: {
        count: vi.fn().mockResolvedValue(0), // 0 active items found out of 1 requested
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    await expect(
      service.createDemand(actorId, {
        number: "DEM-001",
        lines: [{ itemId: itemUuid, quantity: "10", requiredDate: "2026-12-01" }],
      }),
    ).rejects.toThrowError(new PlanningError("INVALID_INPUT", "All demand items must be active"));
  });

  it("createDemand creates demand and computes earliest requiredDate correctly", async () => {
    const mockTx = {
      item: {
        count: vi.fn().mockResolvedValue(2),
      },
      productionDemand: {
        create: vi.fn().mockResolvedValue({
          id: demandId,
          number: "DEM-002",
          requiredDate: new Date("2026-11-15T00:00:00.000Z"),
          lines: [{ id: "line-1" }, { id: "line-2" }],
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    const result = await service.createDemand(actorId, {
      number: "DEM-002",
      lines: [
        { itemId: itemUuid, quantity: "10", requiredDate: "2026-12-01T00:00:00.000Z" },
        { itemId: itemUuid2, quantity: "20", requiredDate: "2026-11-15T00:00:00.000Z" },
      ],
    });

    expect(result.id).toBe(demandId);
    expect(mockTx.productionDemand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "DEM-002",
          requiredDate: new Date("2026-11-15T00:00:00.000Z"),
        }),
      }),
    );
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "production_demand.created", entityId: demandId }),
      }),
    );
  });

  it("releaseDemand throws NOT_FOUND when demand does not exist", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    await expect(service.releaseDemand(actorId, demandId)).rejects.toThrowError(
      new PlanningError("NOT_FOUND", "Production demand not found"),
    );
  });

  it("releaseDemand rejects non-draft demand", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue({ id: demandId, status: "RELEASED", lines: [] }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    await expect(service.releaseDemand(actorId, demandId)).rejects.toThrowError(
      new PlanningError("INVALID_STATE", "Only draft demand can be released"),
    );
  });

  it("releaseDemand updates status to RELEASED and logs audit", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue({ id: demandId, number: "DEM-003", status: "DRAFT", lines: [] }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: demandId, number: "DEM-003", status: "RELEASED", lines: [] }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    const result = await service.releaseDemand(actorId, demandId);
    expect(result.status).toBe("RELEASED");
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "production_demand.released", entityId: demandId }),
      }),
    );
  });

  it("cancelDemand throws NOT_FOUND when demand does not exist", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    await expect(service.cancelDemand(actorId, demandId)).rejects.toThrowError(
      new PlanningError("NOT_FOUND", "Production demand not found"),
    );
  });

  it("cancelDemand rejects cancelling an already CANCELLED demand", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue({ id: demandId, status: "CANCELLED", lines: [] }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    await expect(service.cancelDemand(actorId, demandId)).rejects.toThrowError(
      new PlanningError("INVALID_STATE", "Only draft or released demand can be cancelled"),
    );
  });

  it("cancelDemand cancels DRAFT or RELEASED demand successfully", async () => {
    const mockTx = {
      productionDemand: {
        findUnique: vi.fn().mockResolvedValue({ id: demandId, number: "DEM-004", status: "RELEASED", lines: [] }),
        update: vi.fn().mockResolvedValue({ id: demandId, number: "DEM-004", status: "CANCELLED", lines: [] }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-3" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new PlanningService(mockPrisma as never);

    const result = await service.cancelDemand(actorId, demandId);
    expect(result.status).toBe("CANCELLED");
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "production_demand.cancelled", entityId: demandId }),
      }),
    );
  });
});
