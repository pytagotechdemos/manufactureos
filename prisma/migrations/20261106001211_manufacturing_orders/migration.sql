-- CreateEnum
CREATE TYPE "ManufacturingOrderStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC_PENDING', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "status" "ManufacturingOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceRecommendationId" UUID,
    "bomId" UUID,
    "bomSnapshot" JSONB NOT NULL,
    "routingSnapshot" JSONB,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "completedQuantity" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "responsibleUserId" UUID,
    "createdById" UUID NOT NULL,
    "releasedById" UUID,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderMaterial" (
    "id" UUID NOT NULL,
    "manufacturingOrderId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "plannedQty" DECIMAL(19,6) NOT NULL,
    "issuedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "uomCode" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "ManufacturingOrderMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "manufacturingOrderId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "operationCode" TEXT NOT NULL,
    "workCenterCode" TEXT,
    "targetQuantity" DECIMAL(19,6) NOT NULL,
    "completedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "rejectedQty" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_number_key" ON "ManufacturingOrder"("number");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_itemId_status_idx" ON "ManufacturingOrder"("itemId", "status");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_sourceRecommendationId_idx" ON "ManufacturingOrder"("sourceRecommendationId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderMaterial_itemId_idx" ON "ManufacturingOrderMaterial"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderMaterial_manufacturingOrderId_sequence_key" ON "ManufacturingOrderMaterial"("manufacturingOrderId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_manufacturingOrderId_sequence_key" ON "WorkOrder"("manufacturingOrderId", "sequence");

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_sourceRecommendationId_fkey" FOREIGN KEY ("sourceRecommendationId") REFERENCES "MrpRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
