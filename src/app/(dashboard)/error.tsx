"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard page error:", error);
  }, [error]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Kesalahan"
        title="Terjadi Kendala Memuat Halaman"
        description="Terjadi kendala saat memproses data pada modul ini."
      />

      <Card>
        <CardBody className="py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle aria-hidden className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Gagal Memuat Komponen Halaman
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {error.message || "Terjadi kesalahan internal. Periksa koneksi atau hak akses akun Anda."}
          </p>
          {error.digest ? (
            <p className="mt-1 font-mono text-xs text-slate-400">
              Digest: {error.digest}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button onClick={reset} variant="primary">
              <RotateCcw aria-hidden className="size-4 mr-2" />
              Coba Lagi
            </Button>
            <Link href="/overview">
              <Button variant="secondary">
                <ArrowLeft aria-hidden className="size-4 mr-2" />
                Kembali ke Ringkasan
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
