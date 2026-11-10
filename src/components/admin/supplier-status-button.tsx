"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SupplierStatusButton({
  supplierId,
  currentStatus,
}: {
  supplierId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const label = currentStatus === "ACTIVE" ? "Nonaktifkan" : "Aktifkan";

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/suppliers/${supplierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mengubah status supplier");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengubah status supplier");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={currentStatus === "ACTIVE" ? "secondary" : "primary"}
      loading={loading}
      onClick={handleToggle}
      className={currentStatus === "ACTIVE" ? "text-red-700 hover:bg-red-50 hover:text-red-800" : undefined}
    >
      {label}
    </Button>
  );
}
