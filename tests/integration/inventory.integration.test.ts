import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { InventoryService } from "@/modules/inventory/application/inventory-service";

const suite = process.env.RUN_DB_INTEGRATION === "true" ? describe : describe.skip;
let prisma: PrismaClient;
let inventory: InventoryService;
let actorId: string;
let itemId: string;
let warehouseId: string;
let destinationWarehouseId: string;
let uomId: string;
let categoryId: string;

suite("Inventory PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? new PrismaPg({ connectionString }) : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    inventory = new InventoryService(prisma);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    actorId = randomUUID();
    itemId = randomUUID();
    warehouseId = randomUUID();
    destinationWarehouseId = randomUUID();
    uomId = randomUUID();
    categoryId = randomUUID();
    await prisma.user.create({ data: { id: actorId, name: "Inventory Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" } });
    await prisma.itemCategory.create({ data: { id: categoryId, code: `INV-CAT-${suffix}`, name: "Inventory Test" } });
    await prisma.unitOfMeasure.create({ data: { id: uomId, code: `INV-EA-${suffix}`, name: "Each", dimension: "COUNT", precision: 0 } });
    await prisma.item.create({ data: { id: itemId, sku: `INV-${suffix}`, name: "Inventory Fixture", categoryId, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: uomId } });
    await prisma.warehouse.createMany({ data: [
      { id: warehouseId, code: `WH-${suffix}`, name: "Test Warehouse" },
      { id: destinationWarehouseId, code: `WH2-${suffix}`, name: "Destination Warehouse" },
    ] });
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  it("posts receipt idempotently, reserves, prevents over-issue, and issues atomically", async () => {
    const receiptInput = { itemId, warehouseId, quantity: "10", sourceType: "TEST_RECEIPT", sourceId: randomUUID(), idempotencyKey: `receipt-${randomUUID()}` };
    const receipt = await inventory.receive(actorId, receiptInput);
    const duplicate = await inventory.receive(actorId, receiptInput);
    expect(duplicate.id).toBe(receipt.id);

    const reservation = await inventory.reserve(actorId, { itemId, warehouseId, quantity: "4", sourceType: "TEST_MO", sourceId: randomUUID(), idempotencyKey: `reservation-${randomUUID()}` });
    const balanceAfterReservation = (await inventory.balances({ itemId, warehouseId }))[0];
    expect(balanceAfterReservation?.onHand.toString()).toBe("10");
    expect(balanceAfterReservation?.reserved.toString()).toBe("4");
    expect(balanceAfterReservation?.available.toString()).toBe("6");

    await expect(inventory.issue(actorId, { itemId, warehouseId, quantity: "7", sourceType: "TEST_ISSUE", sourceId: randomUUID(), idempotencyKey: `issue-fail-${randomUUID()}` })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await inventory.issue(actorId, { itemId, warehouseId, quantity: "6", sourceType: "TEST_ISSUE", sourceId: randomUUID(), idempotencyKey: `issue-${randomUUID()}` });
    const balanceAfterIssue = (await inventory.balances({ itemId, warehouseId }))[0];
    expect(balanceAfterIssue?.onHand.toString()).toBe("4");
    expect(balanceAfterIssue?.reserved.toString()).toBe("4");
    expect(balanceAfterIssue?.available.toString()).toBe("0");

    await inventory.releaseReservation(actorId, reservation.id);
    const finalBalance = (await inventory.balances({ itemId, warehouseId }))[0];
    expect(finalBalance?.reserved.toString()).toBe("0");
    expect(finalBalance?.available.toString()).toBe("4");

    const transferInput = { itemId, fromWarehouseId: warehouseId, toWarehouseId: destinationWarehouseId, quantity: "2", sourceType: "TEST_TRANSFER", sourceId: randomUUID(), idempotencyKey: `transfer-${randomUUID()}` };
    const transferMovements = await inventory.transfer(actorId, transferInput);
    expect(transferMovements.map((movement) => movement.movementType).sort()).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
    const repeatedTransfer = await inventory.transfer(actorId, transferInput);
    expect(repeatedTransfer.map((movement) => movement.id).sort()).toEqual(transferMovements.map((movement) => movement.id).sort());
    expect((await inventory.balances({ itemId, warehouseId }))[0]?.onHand.toString()).toBe("2");
    expect((await inventory.balances({ itemId, warehouseId: destinationWarehouseId }))[0]?.onHand.toString()).toBe("2");

    const increased = await inventory.adjust(actorId, { itemId, warehouseId: warehouseId, quantity: "1", direction: "INCREASE", sourceType: "COUNT", sourceId: randomUUID(), idempotencyKey: `adjust-${randomUUID()}` });
    expect(increased.movementType).toBe("ADJUSTMENT_IN");
    await expect(inventory.adjust(actorId, { itemId, warehouseId, quantity: "4", direction: "DECREASE", sourceType: "COUNT", sourceId: randomUUID(), idempotencyKey: `adjust-fail-${randomUUID()}` })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const blocked = await inventory.setBlocked(actorId, { itemId, warehouseId, quantity: "1", action: "BLOCK", sourceType: "QC_HOLD", sourceId: randomUUID(), idempotencyKey: `block-${randomUUID()}` });
    expect(blocked.movementType).toBe("BLOCK");
    expect((await inventory.balances({ itemId, warehouseId }))[0]?.available.toString()).toBe("2");
    const unblocked = await inventory.setBlocked(actorId, { itemId, warehouseId, quantity: "1", action: "UNBLOCK", sourceType: "QC_RELEASE", sourceId: randomUUID(), idempotencyKey: `unblock-${randomUUID()}` });
    expect(unblocked.movementType).toBe("UNBLOCK");

    const concurrentReservations = await Promise.allSettled([
      inventory.reserve(actorId, { itemId, warehouseId, quantity: "3", sourceType: "TEST_MO", sourceId: randomUUID(), idempotencyKey: `reservation-${randomUUID()}` }),
      inventory.reserve(actorId, { itemId, warehouseId, quantity: "3", sourceType: "TEST_MO", sourceId: randomUUID(), idempotencyKey: `reservation-${randomUUID()}` }),
    ]);
    expect(concurrentReservations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrentReservations.filter((result) => result.status === "rejected")).toHaveLength(1);

    const movements = await inventory.movements({ itemId });
    expect(movements).toHaveLength(7);
    expect(movements.filter((movement) => movement.movementType === "TRANSFER_IN" || movement.movementType === "TRANSFER_OUT")).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { entityType: { in: ["StockMovement", "StockReservation"] }, actorId } })).toBe(9);
  });

  it("maintains moving weighted-average value and marks unpriced stock incomplete", async () => {
    const valuedItemId = randomUUID();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
    await prisma.item.create({ data: { id: valuedItemId, sku: `WAC-${suffix}`, name: "Weighted Cost Fixture", categoryId, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: uomId } });
    await inventory.receive(actorId, { itemId: valuedItemId, warehouseId, quantity: "10", unitCost: "2", sourceType: "TEST_RECEIPT", sourceId: randomUUID(), idempotencyKey: `wac-${randomUUID()}` });
    await inventory.receive(actorId, { itemId: valuedItemId, warehouseId, quantity: "10", unitCost: "4", sourceType: "TEST_RECEIPT", sourceId: randomUUID(), idempotencyKey: `wac-${randomUUID()}` });
    let balance = await prisma.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: valuedItemId, warehouseId } } });
    expect(balance.averageUnitCost?.toString()).toBe("3");
    expect(balance.onHandValue.toString()).toBe("60");

    const transfer = await inventory.transfer(actorId, { itemId: valuedItemId, fromWarehouseId: warehouseId, toWarehouseId: destinationWarehouseId, quantity: "4", sourceType: "TEST_WAC_TRANSFER", sourceId: randomUUID(), idempotencyKey: `wac-transfer-${randomUUID()}` });
    expect(transfer.find((movement) => movement.movementType === "TRANSFER_OUT")?.unitCost?.toString()).toBe("3");
    const destinationBalance = await prisma.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: valuedItemId, warehouseId: destinationWarehouseId } } });
    expect(destinationBalance.averageUnitCost?.toString()).toBe("3");
    expect(destinationBalance.onHandValue.toString()).toBe("12");

    const issue = await inventory.issue(actorId, { itemId: valuedItemId, warehouseId, quantity: "2", sourceType: "TEST_ISSUE", sourceId: randomUUID(), idempotencyKey: `wac-issue-${randomUUID()}` });
    expect(issue.unitCost?.toString()).toBe("3");
    expect(issue.costStatus).toBe("VALUED");
    balance = await prisma.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: valuedItemId, warehouseId } } });
    expect(balance.onHandValue.toString()).toBe("42");

    const unvaluedReceipt = await inventory.receive(actorId, { itemId: valuedItemId, warehouseId, quantity: "1", sourceType: "UNPRICED_RECEIPT", sourceId: randomUUID(), idempotencyKey: `wac-unpriced-${randomUUID()}` });
    expect(unvaluedReceipt.costStatus).toBe("UNVALUED");
    balance = await prisma.stockBalance.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId: valuedItemId, warehouseId } } });
    expect(balance.valuationComplete).toBe(false);
    expect(balance.averageUnitCost).toBeNull();
    const unvaluedIssue = await inventory.issue(actorId, { itemId: valuedItemId, warehouseId, quantity: "1", sourceType: "TEST_ISSUE", sourceId: randomUUID(), idempotencyKey: `wac-unvalued-${randomUUID()}` });
    expect(unvaluedIssue.costStatus).toBe("UNVALUED");
    expect(unvaluedIssue.unitCost).toBeNull();
  });
});
