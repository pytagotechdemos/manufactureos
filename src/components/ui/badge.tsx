import type { ReactNode } from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

const toneClasses: Record<Tone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  violet: "bg-violet-500",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} />;
}

/**
 * Domain status → visual tone. One place, so every screen reads the same
 * colour for the same state.
 */
export function statusTone(status: string | null | undefined): Tone {
  const value = (status ?? "").toUpperCase();

  if (["APPROVED", "ACTIVE", "POSTED", "COMPLETED", "ACCEPTED", "CLOSED", "AVAILABLE", "RELEASED", "PASS", "PASSED", "CONSUMED", "FULLY_RECEIVED"].includes(value)) {
    return "success";
  }
  if (["IN_REVIEW", "PENDING", "SENT", "SUBMITTED", "INVITED", "QC_PENDING", "INSPECTION", "AWAITING_QC", "REWORK"].includes(value)) {
    return "warning";
  }
  if (["REJECTED", "CANCELLED", "CANCELED", "OBSOLETE", "BLOCKED", "QUARANTINE", "FAILED", "FAIL", "BANNED", "DISABLED", "ON_HOLD"].includes(value)) {
    return "danger";
  }
  if (["IN_PROGRESS", "PLANNED", "STARTED", "PARTIAL", "PARTIALLY_RECEIVED", "OPEN"].includes(value)) {
    return "violet";
  }
  if (["DRAFT", "NEW", "IDLE", "PAUSED", "READY", "RESERVED"].includes(value)) {
    return "info";
  }
  return "neutral";
}

/** Ubah status enum ke Bahasa Indonesia. Satu tempat agar konsisten di semua layar. */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const v = value.toUpperCase();
  const idMap: Record<string, string> = {
    DRAFT: "Draf",
    IN_REVIEW: "Ditinjau",
    APPROVED: "Disetujui",
    OBSOLETE: "Usang",
    ACTIVE: "Aktif",
    INACTIVE: "Nonaktif",
    POSTED: "Diposting",
    COMPLETED: "Selesai",
    ACCEPTED: "Diterima",
    CLOSED: "Ditutup",
    AVAILABLE: "Tersedia",
    RELEASED: "Dirilis",
    REJECTED: "Ditolak",
    CANCELLED: "Dibatalkan",
    CANCELED: "Dibatalkan",
    BLOCKED: "Diblokir",
    FAILED: "Gagal",
    BANNED: "Dinonaktifkan",
    DISABLED: "Dinonaktifkan",
    ON_HOLD: "Ditahan",
    IN_PROGRESS: "Sedang Diproses",
    PLANNED: "Direncanakan",
    STARTED: "Dimulai",
    PARTIAL: "Sebagian",
    PARTIALLY_RECEIVED: "Diterima Sebagian",
    FULLY_RECEIVED: "Diterima Penuh",
    OPEN: "Terbuka",
    NEW: "Baru",
    IDLE: "Menganggur",
    PAUSED: "Dijeda",
    READY: "Siap",
    RESERVED: "Direservasi",
    CONSUMED: "Terpakai",
    QC_PENDING: "Menunggu QC",
    INSPECTION: "Inspeksi",
    REWORK: "Pengerjaan Ulang",
    PENDING: "Menunggu",
    SUBMITTED: "Diajukan",
    SENT: "Terkirim",
    INVITED: "Diundang",
    AWAITING_QC: "Menunggu QC",
    QUARANTINE: "Karantina",
    PASS: "Lulus",
    PASSED: "Lulus",
    FAIL: "Gagal",
    BUY: "Beli",
    MAKE: "Buat",
    RAW_MATERIAL: "Bahan Baku",
    PURCHASED_COMPONENT: "Komponen Beli",
    SUB_ASSEMBLY: "Sub-rakitan",
    FINISHED_GOODS: "Barang Jadi",
    CONSUMABLE: "Bahan Habis Pakai",
  };
  if (idMap[v]) return idMap[v];
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function StatusBadge({ status, showDot = true }: { status: string | null | undefined; showDot?: boolean }) {
  const tone = statusTone(status);
  return (
    <Badge tone={tone}>
      {showDot ? <StatusDot tone={tone} /> : null}
      {humanize(status)}
    </Badge>
  );
}
