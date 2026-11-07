"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SidebarContent, type SessionUser } from "@/components/layout/sidebar";
import { isActivePath, navItems } from "@/components/layout/nav";

function titleForPath(pathname: string): string {
  const match = navItems.find((item) => isActivePath(pathname, item));
  if (match) return match.label;
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Ringkasan";
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const dateLabel = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
              type="button"
            />
            <div className="absolute inset-y-0 left-0 w-60 border-r border-slate-200 shadow-xl">
              <button
                aria-label="Tutup navigasi"
                className="absolute top-3.5 right-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setDrawerOpen(false)}
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
              aria-label="Buka navigasi"
              className="-ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <Menu aria-hidden className="size-5" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-900">{titleForPath(pathname)}</p>
              <p className="hidden truncate text-[11px] text-slate-500 sm:block">Operasi pabrik · {dateLabel}</p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:inline-flex">
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                WIB
              </span>
              <span
                className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white md:hidden"
                title={user.email}
              >
                {user.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
