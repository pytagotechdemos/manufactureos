"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "danger" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastFunction = (tone: ToastTone, message: string) => void;

const ToastContext = createContext<ToastFunction | null>(null);

const toneStyles: Record<ToastTone, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: "border-emerald-200 bg-white text-slate-800",
    icon: <CheckCircle2 aria-hidden className="size-5 text-emerald-500" />,
  },
  danger: {
    wrapper: "border-red-200 bg-white text-slate-800",
    icon: <AlertTriangle aria-hidden className="size-5 text-red-500" />,
  },
  info: {
    wrapper: "border-blue-200 bg-white text-slate-800",
    icon: <Info aria-hidden className="size-5 text-blue-500" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastFunction>(
    (tone, message) => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, tone === "danger" ? 7000 : 4500);
    },
    [],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-atomic="false"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
      >
        {toasts.map((toast) => {
          const style = toneStyles[toast.tone];
          return (
            <div
              className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-white p-3 shadow-lg ${style.wrapper}`}
              key={toast.id}
              role={toast.tone === "danger" ? "alert" : "status"}
            >
              <span className="mt-0.5 shrink-0">{style.icon}</span>
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed">{toast.message}</p>
              <button
                aria-label="Tutup notifikasi"
                className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFunction {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
