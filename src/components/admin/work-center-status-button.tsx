"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function WorkCenterStatusButton({
  workCenterId,
  currentStatus,
}: {
  workCenterId: string;
  currentStatus: string;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      endpoint={`/api/v1/manufacturing/work-centers/${workCenterId}`}
      entityLabel="work center"
    />
  );
}
