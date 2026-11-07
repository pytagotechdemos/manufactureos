-- CreateEnum
CREATE TYPE "ProductionDemandStatus" AS ENUM ('DRAFT', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MrpRunStatus" AS ENUM ('COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "expectedDelivery" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductionDemand" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ProductionDemandStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedById" UUID NOT NULL,
    "requiredDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionDemand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDemandLine" (
    "id" UUID NOT NULL,
    "demandId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionDemandLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpRun" (
    "id" UUID NOT NULL,
    "runNumber" TEXT NOT NULL,
    "status" "MrpRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrpRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpBucket" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "grossRequirements" DECIMAL(19,6) NOT NULL,
    "scheduledReceipts" DECIMAL(19,6) NOT NULL,
    "projectedAvailable" DECIMAL(19,6) NOT NULL,
    "netRequirements" DECIMAL(19,6) NOT NULL,

    CONSTRAINT "MrpBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpRecommendation" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "bucketId" UUID,
    "itemId" UUID NOT NULL,
    "supplyType" "SupplyType" NOT NULL,
    "quantity" DECIMAL(19,6) NOT NULL,
    "requiredDate" TIMESTAMP(3) NOT NULL,
    "plannedReleaseDate" TIMESTAMP(3) NOT NULL,
    "late" BOOLEAN NOT NULL,

    CONSTRAINT "MrpRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrpRecommendationSource" (
    "id" UUID NOT NULL,
    "recommendationId" UUID NOT NULL,
    "demandLineId" UUID NOT NULL,

    CONSTRAINT "MrpRecommendationSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDemand_number_key" ON "ProductionDemand"("number");

-- CreateIndex
CREATE INDEX "ProductionDemandLine_itemId_requiredDate_idx" ON "ProductionDemandLine"("itemId", "requiredDate");

-- CreateIndex
CREATE INDEX "ProductionDemandLine_demandId_idx" ON "ProductionDemandLine"("demandId");

-- CreateIndex
CREATE UNIQUE INDEX "MrpRun_runNumber_key" ON "MrpRun"("runNumber");

-- CreateIndex
CREATE INDEX "MrpRun_asOfDate_createdAt_idx" ON "MrpRun"("asOfDate", "createdAt");

-- CreateIndex
CREATE INDEX "MrpBucket_itemId_bucketDate_idx" ON "MrpBucket"("itemId", "bucketDate");

-- CreateIndex
CREATE UNIQUE INDEX "MrpBucket_runId_itemId_bucketDate_key" ON "MrpBucket"("runId", "itemId", "bucketDate");

-- CreateIndex
CREATE INDEX "MrpRecommendation_runId_itemId_requiredDate_idx" ON "MrpRecommendation"("runId", "itemId", "requiredDate");

-- CreateIndex
CREATE UNIQUE INDEX "MrpRecommendationSource_recommendationId_demandLineId_key" ON "MrpRecommendationSource"("recommendationId", "demandLineId");

-- AddForeignKey
ALTER TABLE "ProductionDemandLine" ADD CONSTRAINT "ProductionDemandLine_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "ProductionDemand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDemandLine" ADD CONSTRAINT "ProductionDemandLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpBucket" ADD CONSTRAINT "MrpBucket_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MrpRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpBucket" ADD CONSTRAINT "MrpBucket_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRecommendation" ADD CONSTRAINT "MrpRecommendation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MrpRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRecommendation" ADD CONSTRAINT "MrpRecommendation_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "MrpBucket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRecommendation" ADD CONSTRAINT "MrpRecommendation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRecommendationSource" ADD CONSTRAINT "MrpRecommendationSource_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "MrpRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrpRecommendationSource" ADD CONSTRAINT "MrpRecommendationSource_demandLineId_fkey" FOREIGN KEY ("demandLineId") REFERENCES "ProductionDemandLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
