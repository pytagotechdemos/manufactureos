CREATE TABLE "WorkCenter" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hourlyRate" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "standardMinutes" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkCenter_rates_nonnegative" CHECK ("hourlyRate" >= 0 AND "standardMinutes" >= 0)
);
CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");

ALTER TABLE "WorkOrder" ADD COLUMN "workCenterId" UUID;
ALTER TABLE "WorkOrder" ADD COLUMN "standardMinutes" DECIMAL(19,4) NOT NULL DEFAULT 0;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkOrderTimeEntry" (
  "id" UUID NOT NULL,
  "workOrderId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "minutes" DECIMAL(19,4) NOT NULL,
  "hourlyRate" DECIMAL(19,4) NOT NULL,
  "actorId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderTimeEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkOrderTimeEntry_minutes_positive" CHECK ("minutes" > 0),
  CONSTRAINT "WorkOrderTimeEntry_rate_nonnegative" CHECK ("hourlyRate" >= 0)
);
CREATE UNIQUE INDEX "WorkOrderTimeEntry_idempotencyKey_key" ON "WorkOrderTimeEntry"("idempotencyKey");
CREATE INDEX "WorkOrderTimeEntry_workOrderId_createdAt_idx" ON "WorkOrderTimeEntry"("workOrderId", "createdAt");
ALTER TABLE "WorkOrderTimeEntry" ADD CONSTRAINT "WorkOrderTimeEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
