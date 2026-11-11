"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

type ConfirmRequest = {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const requestRef = useRef<ConfirmRequest | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback<ConfirmFunction>((options) => {
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(confirmed);
  }, []);

  useEffect(() => {
    if (!request) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [request, finish]);

  const options = request?.options;
  const tone = options?.tone ?? "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && options ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
          <button
            aria-label="Batalkan dialog"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => finish(false)}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-describedby={options.description ? descriptionId : undefined}
            aria-labelledby={titleId}
            aria-modal="true"
            className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
            ref={dialogRef}
            role="alertdialog"
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                  tone === "danger" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"
                }`}
              >
                <AlertTriangle aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-slate-900" id={titleId}>
                  {options.title}
                </h2>
                {options.description ? (
                  <div className="mt-1.5 text-[13px] leading-relaxed text-slate-600" id={descriptionId}>
                    {options.description}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => finish(false)} ref={cancelButtonRef} variant="secondary">
                {options.cancelLabel ?? "Batal"}
              </Button>
              <Button onClick={() => finish(true)} variant={tone === "danger" ? "danger" : "primary"}>
                {options.confirmLabel ?? "Ya, lanjutkan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFunction {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return context;
}
