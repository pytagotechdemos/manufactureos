"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { isActivePath, navGroups } from "@/components/layout/nav";

export type SessionUser = {
  name: string;
  email: string;
  roleNames: string[];
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function SidebarContent({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const pathname = usePathname();

  async function handleSignOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-600 text-white">
          <Factory aria-hidden className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] leading-4 font-semibold text-slate-900">ManufactureOS</span>
          <span className="block text-[11px] leading-4 text-slate-500">Manufacturing ERP</span>
        </span>
      </div>

      <nav aria-label="Main navigation" className="scroll-area flex-1 overflow-y-auto px-2.5 py-3">
        {navGroups.map((group) => (
          <div className="mb-4 last:mb-0" key={group.label ?? "root"}>
            {group.label ? (
              <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-brand-50 font-medium text-brand-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                      href={item.href}
                      onClick={onNavigate}
                    >
                      {active ? (
                        <span aria-hidden className="absolute top-1/2 -left-2.5 h-4 w-0.5 -translate-y-1/2 rounded-r bg-brand-600" />
                      ) : null}
                      <Icon aria-hidden className={`size-4 shrink-0 ${active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-4 font-medium text-slate-900">{user.name}</span>
            <span className="block truncate text-[11px] leading-4 text-slate-500">
              {user.roleNames.length > 0 ? user.roleNames.join(", ") : user.email}
            </span>
          </span>
          <button
            aria-label="Sign out"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={handleSignOut}
            title="Sign out"
            type="button"
          >
            <LogOut aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
