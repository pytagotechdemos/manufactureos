import { describe, expect, it, vi } from "vitest";
import { QualityError, QualityService } from "./quality-service";

describe("QualityService operations", () => {
  const actorId = "user-inspector-1";
  const inspectionId = "d0000000-0000-4000-8000-000000000001";
  const moId = "c0000000-0000-4000-8000-000000000001";

  it("deleteInspection throws NOT_FOUND when inspection does not exist", async () => {
    const mockTx = {
      qcInspection: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new QualityService(mockPrisma as never);

    await expect(service.deleteInspection(actorId, inspectionId)).rejects.toThrowError(
      new QualityError("NOT_FOUND", "QC inspection not found"),
    );
  });

  it("deleteInspection rejects deleting non-draft inspections", async () => {
    const mockTx = {
      qcInspection: {
        findUnique: vi.fn().mockResolvedValue({ id: inspectionId, status: "POSTED" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new QualityService(mockPrisma as never);

    await expect(service.deleteInspection(actorId, inspectionId)).rejects.toThrowError(
      new QualityError("INVALID_STATE", "Only draft inspections can be deleted"),
    );
  });

  it("deleteInspection deletes draft inspection and logs audit", async () => {
    const mockTx = {
      qcInspection: {
        findUnique: vi.fn().mockResolvedValue({ id: inspectionId, number: "QC-001", status: "DRAFT" }),
        delete: vi.fn().mockResolvedValue({ id: inspectionId }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-qc-1" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new QualityService(mockPrisma as never);

    const result = await service.deleteInspection(actorId, inspectionId);
    expect(result).toEqual({ success: true });
    expect(mockTx.qcInspection.delete).toHaveBeenCalledWith({ where: { id: inspectionId } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "qc_inspection.deleted", entityId: inspectionId }),
      }),
    );
  });

  it("createInspection rejects when MO is not ready for QC", async () => {
    const mockTx = {
      manufacturingOrder: {
        findUnique: vi.fn().mockResolvedValue({ id: moId, status: "PLANNED" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new QualityService(mockPrisma as never);

    await expect(
      service.createInspection(actorId, {
        number: "QC-002",
        manufacturingOrderId: moId,
        inspectedQty: "10",
        acceptedQty: "10",
        rejectedQty: "0",
        reworkQty: "0",
      }),
    ).rejects.toThrowError(
      new QualityError("INVALID_STATE", "Manufacturing order is not ready for QC"),
    );
  });
});
