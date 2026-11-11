"use client";

import { StatusToggleButton } from "@/components/admin/status-toggle-button";

export function UserStatusButton({
  userId,
  currentStatus,
  isSelf,
}: {
  userId: string;
  currentStatus: string;
  isSelf: boolean;
}) {
  return (
    <StatusToggleButton
      currentStatus={currentStatus}
      disabled={isSelf}
      disabledLabel="Akun Anda"
      endpoint={`/api/v1/users/${userId}`}
      entityLabel="pengguna"
      inactiveStatus="DISABLED"
    />
  );
}
