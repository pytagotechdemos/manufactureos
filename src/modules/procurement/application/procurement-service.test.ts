import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { ProcurementError, ProcurementService } from "./procurement-service";

describe("ProcurementService lifecycle operations", () => {
  const actorId = "user-123";
  const orderId = "order-456";
  const requestId = "request-789";
  const receiptId = "receipt-101";

  it("cancelPurchaseOrder throws NOT_FOUND when order does not exist", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.cancelPurchaseOrder(actorId, orderId)).rejects.toThrowError(
      new ProcurementError("NOT_FOUND", "Purchase order not found"),
    );
  });

  it("cancelPurchaseOrder rejects cancelling an order that is already PARTIALLY_RECEIVED or CLOSED", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          status: "PARTIALLY_RECEIVED",
          lines: [],
        }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.cancelPurchaseOrder(actorId, orderId)).rejects.toThrowError(
      /Only draft or approved purchase orders can be cancelled/,
    );
  });

  it("cancelPurchaseOrder rejects cancelling an order with received lines", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          status: "APPROVED",
          lines: [{ id: "line-1", receivedQty: new Prisma.Decimal(5) }],
        }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.cancelPurchaseOrder(actorId, orderId)).rejects.toThrowError(
      /Purchase orders with received items cannot be cancelled/,
    );
  });

  it("cancelPurchaseOrder cancels approved order with zero receipts, deletes draft GRs and releases PR allocations", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          number: "PO-001",
          status: "APPROVED",
          lines: [{ id: "line-1", receivedQty: new Prisma.Decimal(0) }],
        }),
        update: vi.fn().mockResolvedValue({ id: orderId, status: "CANCELLED" }),
      },
      goodsReceiptLine: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      goodsReceipt: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseRequestAllocation: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    const result = await service.cancelPurchaseOrder(actorId, orderId);
    expect(result.status).toBe("CANCELLED");
    expect(mockTx.goodsReceipt.deleteMany).toHaveBeenCalledWith({ where: { orderId, status: "DRAFT" } });
    expect(mockTx.purchaseRequestAllocation.deleteMany).toHaveBeenCalledWith({ where: { orderId } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "purchase_order.cancelled", entityId: orderId }),
      }),
    );
  });

  it("closePurchaseOrder rejects closing DRAFT or APPROVED orders", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: orderId, status: "APPROVED" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.closePurchaseOrder(actorId, orderId)).rejects.toThrowError(
      /Only partially or fully received purchase orders can be closed/,
    );
  });

  it("closePurchaseOrder closes PARTIALLY_RECEIVED or FULLY_RECEIVED orders successfully", async () => {
    const mockTx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: orderId, number: "PO-002", status: "PARTIALLY_RECEIVED" }),
        update: vi.fn().mockResolvedValue({ id: orderId, status: "CLOSED" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    const result = await service.closePurchaseOrder(actorId, orderId);
    expect(result.status).toBe("CLOSED");
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "purchase_order.closed", entityId: orderId }),
      }),
    );
  });

  it("cancelPurchaseRequest rejects cancelling request with active PO allocations", async () => {
    const mockTx = {
      purchaseRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: requestId,
          status: "APPROVED",
          lines: [
            {
              id: "req-line-1",
              allocations: [{ id: "alloc-1", order: { status: "APPROVED" } }],
            },
          ],
        }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.cancelPurchaseRequest(actorId, requestId)).rejects.toThrowError(
      /Cannot cancel purchase request with active purchase order allocations/,
    );
  });

  it("cancelPurchaseRequest cancels unallocated PR and cleans up stale allocations", async () => {
    const mockTx = {
      purchaseRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: requestId,
          number: "PR-001",
          status: "DRAFT",
          lines: [{ id: "req-line-1", allocations: [] }],
        }),
        update: vi.fn().mockResolvedValue({ id: requestId, status: "CANCELLED" }),
      },
      purchaseRequestAllocation: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-3" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    const result = await service.cancelPurchaseRequest(actorId, requestId);
    expect(result.status).toBe("CANCELLED");
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "purchase_request.cancelled", entityId: requestId }),
      }),
    );
  });

  it("cancelGoodsReceipt rejects cancelling POSTED receipt", async () => {
    const mockTx = {
      goodsReceipt: {
        findUnique: vi.fn().mockResolvedValue({ id: receiptId, status: "POSTED" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    await expect(service.cancelGoodsReceipt(actorId, receiptId)).rejects.toThrowError(
      /Only draft goods receipts can be cancelled/,
    );
  });

  it("cancelGoodsReceipt cancels DRAFT receipt successfully", async () => {
    const mockTx = {
      goodsReceipt: {
        findUnique: vi.fn().mockResolvedValue({ id: receiptId, number: "GR-001", status: "DRAFT" }),
        update: vi.fn().mockResolvedValue({ id: receiptId, status: "CANCELLED" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-4" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new ProcurementService(mockPrisma as never);

    const result = await service.cancelGoodsReceipt(actorId, receiptId);
    expect(result.status).toBe("CANCELLED");
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "goods_receipt.cancelled", entityId: receiptId }),
      }),
    );
  });
});
