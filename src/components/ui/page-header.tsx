"use client";

import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Consistent section heading inside a screen. */
export function SectionTitle({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-900">{children}</h2>
      {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
    </div>
  );
}
