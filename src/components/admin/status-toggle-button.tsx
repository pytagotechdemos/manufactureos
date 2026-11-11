"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function StatusToggleButton({
  endpoint,
  currentStatus,
  entityLabel,
  inactiveStatus = "INACTIVE",
  disabled = false,
  disabledLabel,
}: {
  endpoint: string;
  currentStatus: string;
  /** Lower-case entity name used in feedback, e.g. "gudang". */
  entityLabel: string;
  inactiveStatus?: string;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const router = useRouter();
  const push = useToast();
  const [loading, setLoading] = useState(false);

  const isActive = currentStatus === "ACTIVE";
  const nextStatus = isActive ? inactiveStatus : "ACTIVE";
  const nextLabel = isActive ? "Nonaktifkan" : "Aktifkan";

  async function handleToggle() {
    if (disabled) return;
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? `Gagal mengubah status ${entityLabel}`);
      push("success", `${entityLabel.charAt(0).toUpperCase()}${entityLabel.slice(1)} berhasil ${isActive ? "dinonaktifkan" : "diaktifkan"}.`);
      router.refresh();
    } catch (err) {
      push("danger", err instanceof Error ? err.message : `Gagal mengubah status ${entityLabel}`);
    } finally {
      setLoading(false);
    }
  }

  if (disabled) {
    return <span className="text-[12px] text-slate-400">{disabledLabel ?? "Tidak tersedia"}</span>;
  }

  return (
    <Button
      className={isActive ? "text-red-700 hover:bg-red-50 hover:text-red-800" : undefined}
      loading={loading}
      onClick={handleToggle}
      size="sm"
      variant={isActive ? "secondary" : "primary"}
    >
      {nextLabel}
    </Button>
  );
}
