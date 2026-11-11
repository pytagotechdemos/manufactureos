"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function WarehouseStatusButton({
  warehouseId,
  currentStatus,
}: {
  warehouseId: string;
  currentStatus: string;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      endpoint={`/api/v1/warehouses/${warehouseId}`}
      entityLabel="gudang"
    />
  );
}
