"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  label,
  children,
  className = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog; usually the visible title. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const initial =
      dialog?.querySelector<HTMLElement>("[autofocus]") ??
      dialog?.querySelector<HTMLElement>(focusableSelector);
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null,
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
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        aria-hidden
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          aria-label={label}
          aria-modal="true"
          className={`relative z-10 my-auto w-full ${className}`}
          ref={dialogRef}
          role="dialog"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
