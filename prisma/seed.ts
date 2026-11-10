import "dotenv/config";
import Decimal from "decimal.js";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { seedAccessControl } from "./seed-access-control";

/**
 * Repeatable seed data for the furniture manufacturing scenario.
 *
 * Scenario: Wooden Office Desk production
 * - RM-001 Oak Board (Raw Material, BUY, M)
 * - PC-001 Steel Brackets (Purchased Component, BUY, PCS)
 * - PC-002 Wood Screws (Purchased Component, BUY, PCS)
 * - SA-001 Desk Drawer (Sub-Assembly, MAKE, PCS)
 * - FG-001 Wooden Office Desk (Finished Goods, MAKE, PCS)
 *
 * BOMs:
 * - BOM-DESK-001 v1.0: Wooden Office Desk → Oak Board, Steel Brackets, Wood Screws, Desk Drawer
 * - BOM-DRAWER-001 v1.0: Desk Drawer → Oak Board, Wood Screws
 */

const D = (value: string | number) => new Prisma.Decimal(new Decimal(value).toString());

async function main() {
  // Roles and permissions must exist before any permission check runs.
  await seedAccessControl(prisma);

  await prisma.$transaction(async (tx) => {
    // ── 1. Admin user (needed for createdById / responsibleUserId refs) ─────
    const adminUser = await tx.user.upsert({
      where: { email: "admin@manufactureos.local" },
      update: { name: "System Administrator", status: "ACTIVE" },
      create: {
        email: "admin@manufactureos.local",
        name: "System Administrator",
        status: "ACTIVE",
      },
    });

    // ── 2. Unit of Measure ────────────────────────────────────────────────
    const uomPcs = await tx.unitOfMeasure.upsert({
      where: { code: "PCS" },
      update: { name: "Pieces", dimension: "COUNT", precision: 0 },
      create: { code: "PCS", name: "Pieces", dimension: "COUNT", precision: 0 },
    });
    const uomM = await tx.unitOfMeasure.upsert({
      where: { code: "M" },
      update: { name: "Meter", dimension: "LENGTH", precision: 3 },
      create: { code: "M", name: "Meter", dimension: "LENGTH", precision: 3 },
    });
    await tx.unitOfMeasure.upsert({
      where: { code: "KG" },
      update: { name: "Kilogram", dimension: "MASS", precision: 3 },
      create: { code: "KG", name: "Kilogram", dimension: "MASS", precision: 3 },
    });

    // ── 3. Item Categories ────────────────────────────────────────────────
    const catRaw = await tx.itemCategory.upsert({
      where: { code: "RAW_MATERIAL" },
      update: { name: "Raw Material" },
      create: { code: "RAW_MATERIAL", name: "Raw Material" },
    });
    const catPurchased = await tx.itemCategory.upsert({
      where: { code: "PURCHASED_COMPONENT" },
      update: { name: "Purchased Component" },
      create: { code: "PURCHASED_COMPONENT", name: "Purchased Component" },
    });
    const catSubAssembly = await tx.itemCategory.upsert({
      where: { code: "SUB_ASSEMBLY" },
      update: { name: "Sub-Assembly" },
      create: { code: "SUB_ASSEMBLY", name: "Sub-Assembly" },
    });
    const catFinished = await tx.itemCategory.upsert({
      where: { code: "FINISHED_GOODS" },
      update: { name: "Finished Goods" },
      create: { code: "FINISHED_GOODS", name: "Finished Goods" },
    });

    // ── 4. Items ──────────────────────────────────────────────────────────
    const itemOakBoard = await tx.item.upsert({
      where: { sku: "RM-001" },
      update: {},
      create: {
        sku: "RM-001",
        name: "Oak Board",
        description: "Select-grade oak lumber, 25mm thick",
        categoryId: catRaw.id,
        itemType: "RAW_MATERIAL",
        supplyType: "BUY",
        baseUomId: uomM.id,
        standardMaterialCost: D("45.0000"),
        reorderPoint: D("50"),
        safetyStock: D("20"),
        purchasingLeadDays: 7,
        minimumOrderQty: D("10"),
        lotSizeMultiple: D("5"),
        status: "ACTIVE",
      },
    });
    const itemSteelBrackets = await tx.item.upsert({
      where: { sku: "PC-001" },
      update: {},
      create: {
        sku: "PC-001",
        name: "Steel Brackets",
        description: "L-brackets for desk assembly, zinc-plated",
        categoryId: catPurchased.id,
        itemType: "PURCHASED_COMPONENT",
        supplyType: "BUY",
        baseUomId: uomPcs.id,
        standardMaterialCost: D("2.5000"),
        reorderPoint: D("100"),
        safetyStock: D("50"),
        purchasingLeadDays: 5,
        minimumOrderQty: D("50"),
        lotSizeMultiple: D("10"),
        status: "ACTIVE",
      },
    });
    const itemWoodScrews = await tx.item.upsert({
      where: { sku: "PC-002" },
      update: {},
      create: {
        sku: "PC-002",
        name: "Wood Screws",
        description: "4mm x 40mm wood screws, box of 100",
        categoryId: catPurchased.id,
        itemType: "PURCHASED_COMPONENT",
        supplyType: "BUY",
        baseUomId: uomPcs.id,
        standardMaterialCost: D("0.1500"),
        reorderPoint: D("500"),
        safetyStock: D("200"),
        purchasingLeadDays: 3,
        minimumOrderQty: D("100"),
        lotSizeMultiple: D("50"),
        status: "ACTIVE",
      },
    });
    const itemDeskDrawer = await tx.item.upsert({
      where: { sku: "SA-001" },
      update: {},
      create: {
        sku: "SA-001",
        name: "Desk Drawer",
        description: "Pre-fabricated desk drawer sub-assembly",
        categoryId: catSubAssembly.id,
        itemType: "SUB_ASSEMBLY",
        supplyType: "MAKE",
        baseUomId: uomPcs.id,
        standardMaterialCost: D("12.0000"),
        reorderPoint: D("10"),
        safetyStock: D("5"),
        purchasingLeadDays: 0,
        minimumOrderQty: D("1"),
        lotSizeMultiple: D("1"),
        status: "ACTIVE",
      },
    });
    const itemOfficeDesk = await tx.item.upsert({
      where: { sku: "FG-001" },
      update: {},
      create: {
        sku: "FG-001",
        name: "Wooden Office Desk",
        description: "Executive wooden office desk with drawer",
        categoryId: catFinished.id,
        itemType: "FINISHED_GOODS",
        supplyType: "MAKE",
        baseUomId: uomPcs.id,
        standardMaterialCost: D("180.0000"),
        reorderPoint: D("5"),
        safetyStock: D("2"),
        purchasingLeadDays: 0,
        minimumOrderQty: D("1"),
        lotSizeMultiple: D("1"),
        status: "ACTIVE",
      },
    });

    // ── 5. Supplier ───────────────────────────────────────────────────────
    await tx.supplier.upsert({
      where: { code: "SUP-001" },
      update: {},
      create: {
        code: "SUP-001",
        name: "Furniture Supplies Co.",
        email: "sales@furnituresupplies.local",
        phone: "+62 21 5550 1234",
        address: "Jl. Industri No. 45, Jakarta, Indonesia",
        status: "ACTIVE",
      },
    });

    // ── 6. Warehouses ─────────────────────────────────────────────────────
    const warehouseMain = await tx.warehouse.upsert({
      where: { code: "WH-001" },
      update: {},
      create: {
        code: "WH-001",
        name: "Main Warehouse",
        description: "Primary storage for raw materials and finished goods",
        isWip: false,
        status: "ACTIVE",
      },
    });
    await tx.warehouse.upsert({
      where: { code: "WH-WIP" },
      update: {},
      create: {
        code: "WH-WIP",
        name: "WIP Warehouse",
        description: "Work-in-progress storage on production floor",
        isWip: true,
        status: "ACTIVE",
      },
    });

    // ── 7. Work Centers ───────────────────────────────────────────────────
    await tx.workCenter.upsert({
      where: { code: "WC-ASM" },
      update: {},
      create: {
        code: "WC-ASM",
        name: "Assembly Station 1",
        hourlyRate: D("75.0000"),
        standardMinutes: D("480"),
        status: "ACTIVE",
      },
    });
    await tx.workCenter.upsert({
      where: { code: "WC-CNC" },
      update: {},
      create: {
        code: "WC-CNC",
        name: "CNC Station 2",
        hourlyRate: D("120.0000"),
        standardMinutes: D("480"),
        status: "ACTIVE",
      },
    });
    await tx.workCenter.upsert({
      where: { code: "WC-FIN" },
      update: {},
      create: {
        code: "WC-FIN",
        name: "Finishing Station",
        hourlyRate: D("60.0000"),
        standardMinutes: D("480"),
        status: "ACTIVE",
      },
    });

    // ── 8. BOMs ───────────────────────────────────────────────────────────
    // BOM-DESK-001: Wooden Office Desk v1.0
    const bomDesk = await tx.bom.upsert({
      where: { number: "BOM-DESK-001" },
      update: {},
      create: {
        number: "BOM-DESK-001",
        outputItemId: itemOfficeDesk.id,
        revision: "1.0",
        outputQty: D("1"),
        status: "DRAFT",
        effectiveDate: new Date("2026-01-01T00:00:00Z"),
        createdById: adminUser.id,
      },
    });
    const deskLineCount = await tx.bomLine.count({ where: { bomId: bomDesk.id } });
    if (deskLineCount !== 0 && deskLineCount !== 4) throw new Error("BOM-DESK-001 has an unexpected number of lines");
    if (deskLineCount === 0) {
      await tx.bomLine.createMany({
        data: [
          { bomId: bomDesk.id, componentId: itemOakBoard.id, quantity: D("2.0"), uomId: uomM.id, scrapRate: D("0.05"), sequence: 1, notes: "Tabletop and legs" },
          { bomId: bomDesk.id, componentId: itemSteelBrackets.id, quantity: D("4.0"), uomId: uomPcs.id, scrapRate: D("0.02"), sequence: 2, notes: "Corner brackets" },
          { bomId: bomDesk.id, componentId: itemWoodScrews.id, quantity: D("20.0"), uomId: uomPcs.id, scrapRate: D("0.01"), sequence: 3, notes: "Assembly screws" },
          { bomId: bomDesk.id, componentId: itemDeskDrawer.id, quantity: D("1.0"), uomId: uomPcs.id, scrapRate: D("0"), sequence: 4, notes: "Pre-built drawer" },
        ],
      });
    }
    if (bomDesk.status !== "APPROVED") {
      await tx.bom.update({
        where: { id: bomDesk.id },
        data: { status: "APPROVED", approvedById: adminUser.id, approvedAt: new Date("2026-01-01T00:00:00Z") },
      });
    }

    // BOM-DRAWER-001: Desk Drawer v1.0
    const bomDrawer = await tx.bom.upsert({
      where: { number: "BOM-DRAWER-001" },
      update: {},
      create: {
        number: "BOM-DRAWER-001",
        outputItemId: itemDeskDrawer.id,
        revision: "1.0",
        outputQty: D("1"),
        status: "DRAFT",
        effectiveDate: new Date("2026-01-01T00:00:00Z"),
        createdById: adminUser.id,
      },
    });
    const drawerLineCount = await tx.bomLine.count({ where: { bomId: bomDrawer.id } });
    if (drawerLineCount !== 0 && drawerLineCount !== 2) throw new Error("BOM-DRAWER-001 has an unexpected number of lines");
    if (drawerLineCount === 0) {
      await tx.bomLine.createMany({
        data: [
          { bomId: bomDrawer.id, componentId: itemOakBoard.id, quantity: D("0.5"), uomId: uomM.id, scrapRate: D("0.10"), sequence: 1, notes: "Drawer box panels" },
          { bomId: bomDrawer.id, componentId: itemWoodScrews.id, quantity: D("12.0"), uomId: uomPcs.id, scrapRate: D("0.02"), sequence: 2, notes: "Drawer assembly screws" },
        ],
      });
    }
    if (bomDrawer.status !== "APPROVED") {
      await tx.bom.update({
        where: { id: bomDrawer.id },
        data: { status: "APPROVED", approvedById: adminUser.id, approvedAt: new Date("2026-01-01T00:00:00Z") },
      });
    }

    // ── 9. Stock Balances ─────────────────────────────────────────────────
    await tx.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: itemOakBoard.id, warehouseId: warehouseMain.id } },
      update: {},
      create: {
        itemId: itemOakBoard.id,
        warehouseId: warehouseMain.id,
        onHand: D("200"),
        reserved: D("0"),
        blocked: D("0"),
        onHandValue: D("9000.0000"),
        averageUnitCost: D("45.0000"),
        valuationComplete: true,
      },
    });
    await tx.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: itemSteelBrackets.id, warehouseId: warehouseMain.id } },
      update: {},
      create: {
        itemId: itemSteelBrackets.id,
        warehouseId: warehouseMain.id,
        onHand: D("500"),
        reserved: D("0"),
        blocked: D("0"),
        onHandValue: D("1250.0000"),
        averageUnitCost: D("2.5000"),
        valuationComplete: true,
      },
    });
    await tx.stockBalance.upsert({
      where: { itemId_warehouseId: { itemId: itemWoodScrews.id, warehouseId: warehouseMain.id } },
      update: {},
      create: {
        itemId: itemWoodScrews.id,
        warehouseId: warehouseMain.id,
        onHand: D("5000"),
        reserved: D("0"),
        blocked: D("0"),
        onHandValue: D("750.0000"),
        averageUnitCost: D("0.1500"),
        valuationComplete: true,
      },
    });

    console.log("✅ Seed data created successfully");
    console.log(`   Items: RM-001 Oak Board, PC-001 Steel Brackets, PC-002 Wood Screws, SA-001 Desk Drawer, FG-001 Wooden Office Desk`);
    console.log(`   BOMs: BOM-DESK-001 v1.0, BOM-DRAWER-001 v1.0`);
    console.log(`   Warehouses: WH-001 Main, WH-WIP WIP`);
    console.log(`   Work Centers: WC-ASM, WC-CNC, WC-FIN`);
    console.log(`   Supplier: SUP-001 Furniture Supplies Co.`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
