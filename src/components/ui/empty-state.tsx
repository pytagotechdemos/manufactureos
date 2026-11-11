import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-8" : "py-14"}`}>
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center" role="alert">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500">
        <AlertTriangle aria-hidden className="size-5" />
      </div>
      <p className="text-sm font-medium text-slate-900">Terjadi kendala</p>
      <p className="mt-1 max-w-sm text-[13px] text-slate-500">{message}</p>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry} size="sm" variant="secondary">
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}
