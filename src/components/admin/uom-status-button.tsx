"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function UomStatusButton({
  uomId,
  currentStatus,
}: {
  uomId: string;
  currentStatus: string;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      endpoint={`/api/v1/uoms/${uomId}`}
      entityLabel="satuan"
    />
  );
}
