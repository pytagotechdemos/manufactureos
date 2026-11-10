"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, Clock, Factory, Layers } from "lucide-react";

const links = [
  { href: "/manufacturing", label: "Manufacturing Orders (MO)", icon: Factory, exact: true },
  { href: "/manufacturing/materials", label: "Material & WIP", icon: Layers },
  { href: "/manufacturing/work-orders", label: "Work Orders (WO)", icon: Clock },
  { href: "/manufacturing/receipts", label: "Production Receipts", icon: ArrowDownToLine },
];

export function ManufacturingNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "border-brand-600 text-brand-700 font-semibold"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            <Icon aria-hidden className={`size-4 ${isActive ? "text-brand-600" : "text-slate-400"}`} />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
