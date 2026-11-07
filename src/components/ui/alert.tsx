import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger";

const styles: Record<Tone, { wrapper: string; icon: ReactNode }> = {
  info: {
    wrapper: "border-blue-200 bg-blue-50 text-blue-800",
    icon: <Info aria-hidden className="size-4 text-blue-500" />,
  },
  success: {
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: <CheckCircle2 aria-hidden className="size-4 text-emerald-500" />,
  },
  warning: {
    wrapper: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <AlertTriangle aria-hidden className="size-4 text-amber-500" />,
  },
  danger: {
    wrapper: "border-red-200 bg-red-50 text-red-800",
    icon: <XCircle aria-hidden className="size-4 text-red-500" />,
  },
};

export function Alert({ tone = "info", title, children, onClose }: { tone?: Tone; title?: ReactNode; children: ReactNode; onClose?: () => void }) {
  const style = styles[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] ${style.wrapper}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
      </div>
      {onClose ? (
        <button aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100" onClick={onClose} type="button">
          <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
