"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function CategoryStatusButton({
  categoryId,
  currentStatus,
}: {
  categoryId: string;
  currentStatus: string;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      endpoint={`/api/v1/categories/${categoryId}`}
      entityLabel="kategori"
    />
  );
}
