-- CreateTable
CREATE TABLE "UomConversion" (
    "id" UUID NOT NULL,
    "fromUomId" UUID NOT NULL,
    "toUomId" UUID NOT NULL,
    "factor" DECIMAL(24,12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UomConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UomConversion_toUomId_idx" ON "UomConversion"("toUomId");

-- CreateIndex
CREATE UNIQUE INDEX "UomConversion_fromUomId_toUomId_key" ON "UomConversion"("fromUomId", "toUomId");

-- AddForeignKey
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_fromUomId_fkey" FOREIGN KEY ("fromUomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UomConversion" ADD CONSTRAINT "UomConversion_toUomId_fkey" FOREIGN KEY ("toUomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
