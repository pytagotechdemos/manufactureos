"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-red-50 ring-8 ring-red-50/60">
        <AlertTriangle aria-hidden className="size-8 text-red-600" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Terjadi Kesalahan Sistem
      </h1>
      <p className="mt-2 max-w-lg text-sm text-slate-600">
        Aplikasi mengalami kendala yang tidak terduga. Silakan coba muat ulang halaman ini atau kembali ke menu utama.
      </p>
      {error.digest ? (
        <p className="mt-1 font-mono text-xs text-slate-400">
          Kode kesalahan (digest): {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} variant="primary">
          <RotateCcw aria-hidden className="size-4 mr-2" />
          Coba Muat Ulang
        </Button>
        <Link href="/overview">
          <Button variant="secondary">
            <ArrowLeft aria-hidden className="size-4 mr-2" />
            Kembali ke Beranda
          </Button>
        </Link>
      </div>
      <div className="mt-12 text-xs text-slate-400">
        ManufactureOS &middot; Discrete Manufacturing ERP
      </div>
    </div>
  );
}
