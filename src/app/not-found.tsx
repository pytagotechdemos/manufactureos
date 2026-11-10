import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-slate-100 ring-8 ring-slate-100/60">
        <FileQuestion aria-hidden className="size-8 text-slate-500" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        404 — Halaman Tidak Ditemukan
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Tautan yang Anda tuju mungkin salah, telah dipindahkan, atau Anda tidak memiliki akses ke sumber daya ini.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          href="/overview"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-700 active:bg-brand-700"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Kembali ke Overview
        </Link>
      </div>
      <div className="mt-12 text-xs text-slate-400">
        ManufactureOS &middot; Discrete Manufacturing ERP
      </div>
    </main>
  );
}
