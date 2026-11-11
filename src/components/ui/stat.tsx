import type { ReactNode } from "react";
import Link from "next/link";

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  href?: string;
}) {
  const toneText = {
    neutral: "text-slate-900",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-brand-700",
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        {icon ? <span className="text-slate-300">{icon}</span> : null}
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tnum ${toneText}`}>{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-slate-500">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-xs transition outline-none hover:border-brand-500 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
      {content}
    </div>
  );
}

export function StatGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>{children}</div>;
}
