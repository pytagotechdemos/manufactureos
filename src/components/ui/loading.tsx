import { Loader2 } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 aria-hidden className={`size-4 animate-spin text-slate-400 ${className}`} />;
}

export function LoadingLabel({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`surface-skeleton block h-4 rounded ${className}`} />;
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div className="flex h-11 items-center gap-4 px-4" key={rowIndex}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton className="h-3.5 flex-1" key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}
