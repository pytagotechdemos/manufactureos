import { describe, expect, it, vi } from "vitest";
import { MasterDataError } from "./item-service";
import { UomConversionService } from "./uom-conversion-service";

describe("UomConversionService", () => {
  const actorId = "user-admin-1";
  const uomFromId = "11111111-1111-4111-8111-111111111111";
  const uomToId = "22222222-2222-4222-8222-222222222222";
  const conversionId = "33333333-3333-4333-8333-333333333333";

  it("create rejects when fromUomId equals toUomId", async () => {
    const mockPrisma = {
      $transaction: vi.fn(),
    };
    const service = new UomConversionService(mockPrisma as never);

    await expect(
      service.create(actorId, {
        fromUomId: uomFromId,
        toUomId: uomFromId,
        factor: "10",
      }),
    ).rejects.toThrowError(new MasterDataError("INVALID_INPUT", "Conversion units must differ"));
  });

  it("create rejects when either UOM is not active or found", async () => {
    const mockTx = {
      unitOfMeasure: {
        findMany: vi.fn().mockResolvedValue([{ id: uomFromId, code: "BOX", dimension: "COUNT" }]),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    await expect(
      service.create(actorId, {
        fromUomId: uomFromId,
        toUomId: uomToId,
        factor: "10",
      }),
    ).rejects.toThrowError(new MasterDataError("INVALID_INPUT", "Both UOMs must be active"));
  });

  it("create rejects when dimensions do not match", async () => {
    const mockTx = {
      unitOfMeasure: {
        findMany: vi.fn().mockResolvedValue([
          { id: uomFromId, code: "BOX", dimension: "COUNT" },
          { id: uomToId, code: "KG", dimension: "WEIGHT" },
        ]),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    await expect(
      service.create(actorId, {
        fromUomId: uomFromId,
        toUomId: uomToId,
        factor: "10",
      }),
    ).rejects.toThrowError(new MasterDataError("INVALID_INPUT", "UOM dimensions must match"));
  });

  it("create rejects when a conversion already exists for the pair", async () => {
    const mockTx = {
      unitOfMeasure: {
        findMany: vi.fn().mockResolvedValue([
          { id: uomFromId, code: "BOX", dimension: "COUNT" },
          { id: uomToId, code: "PCS", dimension: "COUNT" },
        ]),
      },
      uomConversion: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-conv" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    await expect(
      service.create(actorId, {
        fromUomId: uomFromId,
        toUomId: uomToId,
        factor: "50",
      }),
    ).rejects.toThrowError(new MasterDataError("CONFLICT", "A conversion already exists for this UOM pair"));
  });

  it("create creates conversion and logs audit on success", async () => {
    const mockTx = {
      unitOfMeasure: {
        findMany: vi.fn().mockResolvedValue([
          { id: uomFromId, code: "BOX", dimension: "COUNT" },
          { id: uomToId, code: "PCS", dimension: "COUNT" },
        ]),
      },
      uomConversion: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: conversionId,
          fromUomId: uomFromId,
          toUomId: uomToId,
          factor: "50",
          fromUom: { code: "BOX" },
          toUom: { code: "PCS" },
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    const result = await service.create(actorId, {
      fromUomId: uomFromId,
      toUomId: uomToId,
      factor: "50",
    });

    expect(result.id).toBe(conversionId);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "uom_conversion.created",
          entityId: conversionId,
        }),
      }),
    );
  });

  it("delete throws NOT_FOUND when conversion does not exist", async () => {
    const mockTx = {
      uomConversion: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    await expect(service.delete(actorId, conversionId)).rejects.toThrowError(
      new MasterDataError("NOT_FOUND", "UOM conversion not found"),
    );
  });

  it("delete deletes conversion and logs audit on success", async () => {
    const mockTx = {
      uomConversion: {
        findUnique: vi.fn().mockResolvedValue({
          id: conversionId,
          factor: "50",
          fromUom: { code: "BOX" },
          toUom: { code: "PCS" },
        }),
        delete: vi.fn().mockResolvedValue({ id: conversionId }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };
    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx)),
    };
    const service = new UomConversionService(mockPrisma as never);

    const result = await service.delete(actorId, conversionId);
    expect(result).toEqual({ success: true });
    expect(mockTx.uomConversion.delete).toHaveBeenCalledWith({ where: { id: conversionId } });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "uom_conversion.deleted",
          entityId: conversionId,
        }),
      }),
    );
  });
});
