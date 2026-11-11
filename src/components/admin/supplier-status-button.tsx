"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function SupplierStatusButton({
  supplierId,
  currentStatus,
}: {
  supplierId: string;
  currentStatus: string;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      endpoint={`/api/v1/suppliers/${supplierId}`}
      entityLabel="supplier"
    />
  );
}
