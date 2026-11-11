"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarContent, type SessionUser } from "@/components/layout/sidebar";
import { isActivePath, navItems } from "@/components/layout/nav";

function titleForPath(pathname: string): string {
  const match = navItems.find((item) => isActivePath(pathname, item));
  if (match) return match.label;
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Overview";
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
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

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 md:block">
          <SidebarContent user={user} />
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              aria-label="Tutup navigasi"
              className="absolute inset-0 bg-slate-900/30"
              onClick={() => setDrawerOpen(false)}
              tabIndex={-1}
              type="button"
            />
            <div
              aria-label="Navigasi utama"
              aria-modal="true"
              className="absolute inset-y-0 left-0 w-64 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl"
              id="mobile-navigation"
              ref={drawerRef}
              role="dialog"
            >
              <button
                aria-label="Tutup navigasi"
                className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
                onClick={() => setDrawerOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
              <SidebarContent user={user} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur md:px-6">
            <button
              aria-controls="mobile-navigation"
              aria-expanded={drawerOpen}
              aria-label="Buka navigasi"
              className="-ml-1 flex size-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none md:hidden"
              onClick={() => setDrawerOpen(true)}
              ref={menuButtonRef}
              type="button"
            >
              <Menu aria-hidden className="size-5" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-900">{titleForPath(pathname)}</p>
              <p className="hidden truncate text-[11px] text-slate-500 sm:block">Enterprise Discrete Manufacturing · {dateLabel}</p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:inline-flex">
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                WIB
              </span>
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white md:hidden"
                title={user.email}
              >
                {user.name.trim()
                  ? user.name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part.charAt(0))
                      .join("")
                      .toUpperCase()
                  : "U"}
              </span>
              <span className="sr-only md:hidden">Masuk sebagai {user.name}</span>
            </div>
          </header>

          <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
