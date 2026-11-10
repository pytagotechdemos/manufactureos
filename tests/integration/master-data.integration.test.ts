import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { MasterDataError, ItemService } from "@/modules/master-data/application/item-service";
import { UomConversionService } from "@/modules/master-data/application/uom-conversion-service";

const suite = process.env.RUN_DB_INTEGRATION === "true" ? describe : describe.skip;
let prisma: PrismaClient;
let items: ItemService;
let conversions: UomConversionService;
let actorId: string;
let categoryId: string;
let eachId: string;
let boxId: string;
let incompatibleUomId: string;
let itemSku: string;

suite("Master data PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required for integration tests");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? new PrismaPg({ connectionString })
      : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    items = new ItemService(prisma);
    conversions = new UomConversionService(prisma);

    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    actorId = randomUUID();
    categoryId = randomUUID();
    eachId = randomUUID();
    boxId = randomUUID();
    incompatibleUomId = randomUUID();
    itemSku = `IT-${suffix}`;

    await prisma.user.create({
      data: { id: actorId, name: "Master Data Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" },
    });
    await prisma.itemCategory.create({ data: { id: categoryId, code: `CAT-${suffix}`, name: "Integration Fixture" } });
    await prisma.unitOfMeasure.createMany({
      data: [
        { id: eachId, code: `EA-${suffix}`, name: "Each", dimension: "COUNT", precision: 0 },
        { id: boxId, code: `BX-${suffix}`, name: "Box", dimension: "COUNT", precision: 0 },
        { id: incompatibleUomId, code: `KG-${suffix}`, name: "Kilogram", dimension: "MASS", precision: 3 },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates and lists an item, and writes audit history", async () => {
    const created = await items.create(actorId, {
      sku: itemSku,
      name: "Integration Test Board",
      categoryId,
      itemType: "RAW_MATERIAL",
      supplyType: "BUY",
      baseUomId: eachId,
      standardMaterialCost: "12500.2500",
      reorderPoint: "3.125000",
    });

    expect(created.sku).toBe(itemSku);
    expect(created.standardMaterialCost?.toString()).toBe("12500.25");

    const listed = await items.list({ search: itemSku, limit: "10", offset: "0" });
    expect(listed.page.total).toBe(1);
    expect(listed.data[0]?.id).toBe(created.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Item", entityId: created.id, action: "item.created" },
    });
    expect(audit?.actorId).toBe(actorId);
  });

  it("rejects duplicate SKU and incompatible UOM conversion", async () => {
    await expect(items.create(actorId, {
      sku: itemSku,
      name: "Duplicate SKU",
      categoryId,
      itemType: "RAW_MATERIAL",
      supplyType: "BUY",
      baseUomId: eachId,
    })).rejects.toMatchObject<Partial<MasterDataError>>({ code: "CONFLICT" });

    await expect(conversions.create(actorId, {
      fromUomId: eachId,
      toUomId: incompatibleUomId,
      factor: "1",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("creates a directed conversion and rejects its reverse duplicate", async () => {
    const conversion = await conversions.create(actorId, {
      fromUomId: boxId,
      toUomId: eachId,
      factor: "12.000000000000",
    });
    expect(conversion.factor.toString()).toBe("12");

    await expect(conversions.create(actorId, {
      fromUomId: eachId,
      toUomId: boxId,
      factor: "0.083333333333",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "UomConversion", entityId: conversion.id, action: "uom_conversion.created" },
    });
    expect(audit?.actorId).toBe(actorId);
  });

  it("creates category, toggles status, and writes immutable audit logs", async () => {
    const catCode = `CAT-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const category = await items.createCategory(actorId, {
      code: catCode,
      name: "Integration Test Category",
    });

    expect(category.code).toBe(catCode);
    expect(category.status).toBe("ACTIVE");

    const deactivated = await items.setCategoryStatus(actorId, category.id, "INACTIVE");
    expect(deactivated.status).toBe("INACTIVE");

    const activated = await items.setCategoryStatus(actorId, category.id, "ACTIVE");
    expect(activated.status).toBe("ACTIVE");

    const auditCreated = await prisma.auditLog.findFirst({
      where: { entityType: "ItemCategory", entityId: category.id, action: "category.created" },
    });
    expect(auditCreated?.actorId).toBe(actorId);

    const auditDeactivated = await prisma.auditLog.findFirst({
      where: { entityType: "ItemCategory", entityId: category.id, action: "category.deactivated" },
    });
    expect(auditDeactivated?.actorId).toBe(actorId);
  });
});
