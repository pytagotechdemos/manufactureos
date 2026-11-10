import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { ManufacturingError, ManufacturingService } from "./manufacturing-service";

describe("ManufacturingService lifecycle and cancel operations", () => {
  const actorId = "user-123";
  const orderId = "order-mo-1";

  it("cancel throws NOT_FOUND when order does not exist", async () => {
    const mockTx = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ManufacturingService(mockPrisma as never);

    await expect(service.cancel(actorId, orderId)).rejects.toThrowError(
      new ManufacturingError("NOT_FOUND", "Manufacturing order not found"),
    );
  });

  it("cancel rejects cancelling completed, cancelled or qc_pending orders", async () => {
    const invalidStatuses = ["COMPLETED", "CANCELLED", "QC_PENDING"];
    for (const status of invalidStatuses) {
      const mockTx = {
        manufacturingOrder: {
          findUnique: vi.fn().mockResolvedValue({
            id: orderId,
            status,
            materials: [],
            workOrders: [],
          }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
      };
      const service = new ManufacturingService(mockPrisma as never);

      await expect(service.cancel(actorId, orderId)).rejects.toThrowError(
        /Completed, cancelled, or QC pending manufacturing orders cannot be cancelled/,
      );
    }
  });

  it("cancel rejects cancelling orders where materials have already been issued to WIP", async () => {
    const mockTx = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          status: "IN_PROGRESS",
          materials: [
            { id: "mat-1", issuedQty: new Prisma.Decimal(10), reservationId: null },
          ],
          workOrders: [],
        }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ManufacturingService(mockPrisma as never);

    await expect(service.cancel(actorId, orderId)).rejects.toThrowError(
      /Cannot cancel manufacturing order with issued materials. Return WIP materials first./,
    );
  });

  it("cancel rejects cancelling orders with active or completed work orders", async () => {
    const mockTx = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          status: "IN_PROGRESS",
          materials: [
            { id: "mat-1", issuedQty: new Prisma.Decimal(0), reservationId: null },
          ],
          workOrders: [
            { id: "wo-1", status: "IN_PROGRESS" },
          ],
        }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ManufacturingService(mockPrisma as never);

    await expect(service.cancel(actorId, orderId)).rejects.toThrowError(
      /Cannot cancel manufacturing order with active or completed work orders./,
    );
  });

  it("cancel successfully cancels DRAFT or PLANNED orders and updates pending work orders", async () => {
    const mockTx = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          number: "MO-001",
          status: "PLANNED",
          materials: [
            { id: "mat-1", issuedQty: new Prisma.Decimal(0), reservationId: null },
          ],
          workOrders: [
            { id: "wo-1", status: "PENDING" },
          ],
        }),
        update: vi.fn().mockResolvedValue({ id: orderId, status: "CANCELLED" }),
      },
      workOrder: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-mo-cancel" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ManufacturingService(mockPrisma as never);

    const result = await service.cancel(actorId, orderId, "Planning revision");
    expect(result.status).toBe("CANCELLED");
    expect(mockTx.workOrder.updateMany).toHaveBeenCalledWith({
      where: { manufacturingOrderId: orderId, status: { in: ["PENDING", "PAUSED"] } },
      data: { status: "CANCELLED" },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "manufacturing_order.cancelled",
          entityId: orderId,
        }),
      }),
    );
  });
});
