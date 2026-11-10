import { describe, expect, it, vi } from "vitest";
import { BomApplicationError, BomService } from "./bom-service";

describe("BomService lifecycle operations", () => {
  const actorId = "user-eng-1";
  const bomId = "b0000000-0000-4000-8000-000000000001";

  it("rejectToDraft throws NOT_FOUND when BOM does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.rejectToDraft(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("NOT_FOUND", "BOM not found"),
    );
  });

  it("rejectToDraft rejects non-IN_REVIEW BOMs", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "DRAFT" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.rejectToDraft(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("INVALID_STATE", "Only in-review BOMs may be returned to draft"),
    );
  });

  it("rejectToDraft successfully resets status to DRAFT and logs audit", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "IN_REVIEW", revision: "A" }),
        update: vi.fn().mockResolvedValue({ id: bomId, status: "DRAFT", revision: "A" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    const result = await service.rejectToDraft(actorId, bomId, "Correction needed on scrap rate");
    expect(result.status).toBe("DRAFT");
    expect(mockTx.bom.update).toHaveBeenCalledWith({
      where: { id: bomId },
      data: { status: "DRAFT" },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bom.rejected_to_draft",
          entityId: bomId,
          metadata: expect.objectContaining({
            revision: "A",
            reason: "Correction needed on scrap rate",
          }),
        }),
      }),
    );
  });

  it("deleteDraft throws NOT_FOUND when BOM does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.deleteDraft(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("NOT_FOUND", "BOM not found"),
    );
  });

  it("deleteDraft rejects non-DRAFT BOMs", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "APPROVED", number: "BOM-001", revision: "A" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.deleteDraft(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("INVALID_STATE", "Only draft BOMs may be deleted"),
    );
  });

  it("deleteDraft deletes DRAFT BOM and logs audit", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "DRAFT", number: "BOM-002", revision: "A" }),
        delete: vi.fn().mockResolvedValue({ id: bomId }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    const result = await service.deleteDraft(actorId, bomId);
    expect(result).toEqual({ success: true });
    expect(mockTx.bom.delete).toHaveBeenCalledWith({ where: { id: bomId } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bom.deleted",
          entityId: bomId,
          metadata: expect.objectContaining({
            number: "BOM-002",
            revision: "A",
          }),
        }),
      }),
    );
  });

  it("obsolete throws NOT_FOUND when BOM does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.obsolete(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("NOT_FOUND", "BOM not found"),
    );
  });

  it("obsolete rejects non-APPROVED BOMs", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "DRAFT" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(service.obsolete(actorId, bomId)).rejects.toThrowError(
      new BomApplicationError("INVALID_STATE", "Only approved BOMs may be obsoleted"),
    );
  });

  it("obsolete transitions APPROVED BOM to OBSOLETE and logs audit", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue({ id: bomId, status: "APPROVED", revision: "A" }),
        update: vi.fn().mockResolvedValue({ id: bomId, status: "OBSOLETE", revision: "A" }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-3" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    const result = await service.obsolete(actorId, bomId);
    expect(result.status).toBe("OBSOLETE");
    expect(mockTx.bom.update).toHaveBeenCalledWith({
      where: { id: bomId },
      data: { status: "OBSOLETE" },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bom.obsoleted",
          entityId: bomId,
        }),
      }),
    );
  });

  it("cloneAsDraft throws NOT_FOUND when source BOM does not exist", async () => {
    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new BomService(mockPrisma as never);

    await expect(
      service.cloneAsDraft(actorId, bomId, { number: "BOM-NEW-001", revision: "B" }),
    ).rejects.toThrowError(new BomApplicationError("NOT_FOUND", "BOM sumber tidak ditemukan"));
  });

  it("cloneAsDraft duplicates all lines into a new DRAFT BOM with audit logging", async () => {
    const sourceBom = {
      id: bomId,
      number: "BOM-ORIG-001",
      revision: "A",
      outputItemId: "item-fg-1",
      outputQty: "1",
      lines: [
        {
          componentId: "item-rm-1",
          quantity: "2.5",
          uomId: "uom-1",
          scrapRate: "0.05",
          sequence: 1,
          notes: "Handle with care",
        },
      ],
    };

    const createdBom = {
      id: "bom-new-uuid",
      number: "BOM-NEW-001",
      revision: "B",
      status: "DRAFT",
      outputItemId: "item-fg-1",
      lines: sourceBom.lines,
    };

    const mockTx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      bom: {
        findUnique: vi.fn().mockResolvedValue(sourceBom),
        create: vi.fn().mockResolvedValue(createdBom),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-clone" }),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };

    const service = new BomService(mockPrisma as never);
    const result = await service.cloneAsDraft(actorId, bomId, {
      number: "BOM-NEW-001",
      revision: "B",
    });

    expect(result.id).toBe("bom-new-uuid");
    expect(mockTx.bom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "BOM-NEW-001",
          revision: "B",
          outputItemId: "item-fg-1",
          createdById: actorId,
          lines: {
            create: [
              expect.objectContaining({
                componentId: "item-rm-1",
                sequence: 1,
                notes: "Handle with care",
              }),
            ],
          },
        }),
      }),
    );

    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "bom.cloned",
          entityId: "bom-new-uuid",
          metadata: expect.objectContaining({ sourceBomId: bomId }),
        }),
      }),
    );
  });
});
