/*
  Warnings:

  - The `status` column on the `Bom` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'OBSOLETE');

-- AlterTable
ALTER TABLE "Bom" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "createdById" UUID,
DROP COLUMN "status",
ADD COLUMN     "status" "BomStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "Bom_outputItemId_status_effectiveDate_idx" ON "Bom"("outputItemId", "status", "effectiveDate");
