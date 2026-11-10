import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ItemService, MasterDataError } from "./item-service";

describe("ItemService", () => {
  it("fetches item detail including stock balances, BOM links, and audit logs", async () => {
    const mockItem = {
      id: "item-1",
      sku: "FG-001",
      name: "Finished Good 1",
      categoryId: "cat-1",
      baseUomId: "uom-1",
      itemType: "FINISHED_GOODS",
      supplyType: "MAKE",
      status: "ACTIVE",
      category: { id: "cat-1", code: "FG", name: "Finished Goods" },
      baseUom: { id: "uom-1", code: "PCS", name: "Pieces", dimension: "COUNT" },
      stockBalances: [
        {
          id: "bal-1",
          onHand: new Prisma.Decimal("50"),
          reserved: new Prisma.Decimal("10"),
          blocked: new Prisma.Decimal("0"),
          onHandValue: new Prisma.Decimal("500000"),
          averageUnitCost: new Prisma.Decimal("10000"),
          valuationComplete: true,
          warehouse: { id: "wh-1", code: "WH-FG", name: "FG Warehouse" },
        },
      ],
      bomOutputs: [
        {
          id: "bom-1",
          number: "BOM-FG-001",
          revision: "A",
          status: "APPROVED",
          effectiveDate: new Date("2026-01-01"),
          outputQty: new Prisma.Decimal("1"),
        },
      ],
      bomComponents: [],
    };

    const mockAuditLogs = [
      {
        id: "audit-1",
        action: "item.created",
        entityType: "Item",
        entityId: "item-1",
        source: "master-data",
        metadata: { sku: "FG-001" },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        actor: { id: "user-1", name: "Admin", email: "admin@manufactureos.local" },
      },
    ];

    const prismaMock = {
      item: {
        findUnique: vi.fn().mockResolvedValue(mockItem),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue(mockAuditLogs),
      },
    } as unknown as PrismaClient;

    const service = new ItemService(prismaMock);
    const result = await service.getItemDetail("item-1");

    expect(result.item.id).toBe("item-1");
    expect(result.item.sku).toBe("FG-001");
    expect(result.item.stockBalances).toHaveLength(1);
    expect(result.item.bomOutputs).toHaveLength(1);
    expect(result.auditLogs).toHaveLength(1);
    expect(result.auditLogs[0].action).toBe("item.created");
  });

  it("throws NOT_FOUND when requesting detail for a non-existent item", async () => {
    const prismaMock = {
      item: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;

    const service = new ItemService(prismaMock);
    await expect(service.getItemDetail("item-non-existent")).rejects.toThrow(MasterDataError);
    await expect(service.getItemDetail("item-non-existent")).rejects.toThrow("Item not found");
  });

  it("updates item status and logs audit entry", async () => {
    const mockTransaction = {
      item: {
        update: vi.fn().mockResolvedValue({
          id: "item-1",
          sku: "RM-001",
          status: "INACTIVE",
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const prismaMock = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof mockTransaction) => unknown) => {
        return callback(mockTransaction);
      }),
    } as unknown as PrismaClient;

    const service = new ItemService(prismaMock);
    const result = await service.setStatus("user-1", "item-1", "INACTIVE");

    expect(result.status).toBe("INACTIVE");
    expect(mockTransaction.item.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { status: "INACTIVE" },
    });
    expect(mockTransaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "item.deactivated",
        entityType: "Item",
        entityId: "item-1",
      }),
    });
  });

  it("updates item fields and logs diff in audit trail", async () => {
    const existingItem = {
      id: "item-1",
      sku: "PC-001",
      name: "Old Name",
      description: null,
      categoryId: "cat-1",
      standardMaterialCost: new Prisma.Decimal("100"),
      reorderPoint: new Prisma.Decimal("10"),
      safetyStock: new Prisma.Decimal("5"),
      purchasingLeadDays: 7,
      minimumOrderQty: new Prisma.Decimal("50"),
      lotSizeMultiple: new Prisma.Decimal("10"),
      status: "ACTIVE",
    };

    const mockTransaction = {
      item: {
        findUnique: vi.fn().mockResolvedValue(existingItem),
        update: vi.fn().mockResolvedValue({
          ...existingItem,
          name: "New Name",
          purchasingLeadDays: 14,
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const prismaMock = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof mockTransaction) => unknown) => {
        return callback(mockTransaction);
      }),
    } as unknown as PrismaClient;

    const service = new ItemService(prismaMock);
    const result = await service.update("user-1", "item-1", {
      name: "New Name",
      purchasingLeadDays: 14,
    });

    expect(result.name).toBe("New Name");
    expect(mockTransaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        action: "item.updated",
        entityType: "Item",
        entityId: "item-1",
        metadata: expect.objectContaining({
          sku: "PC-001",
          updatedFields: expect.arrayContaining(["name", "purchasingLeadDays"]),
        }),
      }),
    });
  });
});
