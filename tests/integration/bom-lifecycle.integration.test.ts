import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { BomService } from "@/modules/engineering/application/bom-service";

const enabled = process.env.RUN_DB_INTEGRATION === "true";
const suite = enabled ? describe : describe.skip;
let prisma: PrismaClient;
let service: BomService;
let actorId: string;
let outputItemId: string;
let componentItemId: string;
let uomId: string;
let bomId: string;
let bomNumber: string;

suite("BOM lifecycle PostgreSQL integration", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required for integration tests");
    const adapter = connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? new PrismaPg({ connectionString })
      : new PrismaNeon({ connectionString });
    prisma = new PrismaClient({ adapter });
    service = new BomService(prisma);

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    actorId = randomUUID();
    outputItemId = randomUUID();
    componentItemId = randomUUID();
    uomId = randomUUID();
    bomId = randomUUID();
    bomNumber = `TEST-${suffix}`;

    const category = await prisma.itemCategory.create({ data: { code: `TEST-${suffix}`, name: "Integration Test" } });
    await prisma.unitOfMeasure.create({ data: { id: uomId, code: `T-${suffix.slice(0, 8)}`, name: "Test Unit", dimension: "COUNT" } });
    await prisma.user.create({ data: { id: actorId, name: "Integration Test Actor", email: `${suffix}@example.invalid`, status: "ACTIVE" } });

    await prisma.item.createMany({
      data: [
        { id: outputItemId, sku: `TEST-OUT-${suffix}`, name: "Test Output", categoryId: category.id, itemType: "FINISHED_GOODS", supplyType: "MAKE", baseUomId: uomId },
        { id: componentItemId, sku: `TEST-COMP-${suffix}`, name: "Test Component", categoryId: category.id, itemType: "RAW_MATERIAL", supplyType: "BUY", baseUomId: uomId },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates, reviews, approves, audits, and protects an approved BOM", async () => {
    const effectiveDate = new Date(Date.now() - 60_000);
    const draftInput = {
      number: bomNumber,
      outputItemId,
      revision: "A",
      outputQuantity: "1.000000",
      effectiveDate,
      lines: [{ componentItemId, quantity: "2.500000", uomId, scrapRate: "0.05" }],
    };

    const draft = await service.createDraft(actorId, draftInput);
    expect(draft.status).toBe("DRAFT");
    expect(draft.lines).toHaveLength(1);
    bomId = draft.id;

    const inReview = await service.submitForReview(actorId, bomId);
    expect(inReview.status).toBe("IN_REVIEW");

    const approved = await service.approve(actorId, bomId);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(actorId);
    expect(approved.approvedAt).toBeInstanceOf(Date);

    const detail = await service.get(bomId);
    expect(detail.number).toBe(bomNumber);
    const explosion = await service.explosion(bomId, { quantity: "2" });
    expect(explosion.requirements).toEqual([{ itemId: componentItemId, quantity: "5.25", uom: detail.lines[0]?.uom.code }]);
    const listed = await service.list({ search: bomNumber });
    expect(listed.page.total).toBe(1);

    await expect(service.updateDraft(actorId, bomId, draftInput)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });

    await expect(prisma.bomLine.updateMany({
      where: { bomId },
      data: { quantity: "99" },
    })).rejects.toThrow(/Approved BOM lines are immutable/);

    const auditEvents = await prisma.auditLog.findMany({
      where: { entityType: "Bom", entityId: bomId },
      select: { action: true },
      orderBy: { createdAt: "asc" },
    });
    expect(auditEvents.map(({ action }) => action)).toEqual([
      "bom.created",
      "bom.submitted_for_review",
      "bom.approved",
    ]);
  });

  it("does not allow skipping the review state", async () => {
    const freshBom = await prisma.bom.create({
      data: {
        number: `${bomNumber}-SKIP`,
        outputItemId,
        revision: "B",
        outputQty: "1",
        status: "DRAFT",
        effectiveDate: new Date(Date.now() + 120_000),
        createdById: actorId,
      },
    });
    await expect(service.approve(actorId, freshBom.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
