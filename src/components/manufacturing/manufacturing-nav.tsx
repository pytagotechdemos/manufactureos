"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, Clock, Factory, Layers } from "lucide-react";

const links = [
  { href: "/manufacturing", label: "Manufacturing Order (MO)", icon: Factory, exact: true },
  { href: "/manufacturing/materials", label: "Material & WIP", icon: Layers },
  { href: "/manufacturing/work-orders", label: "Work Order (WO)", icon: Clock },
  { href: "/manufacturing/receipts", label: "Penerimaan Produksi", icon: ArrowDownToLine },
];

export function ManufacturingNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi Manufacturing"
      className="scroll-area -mx-1 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-1"
    >
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 rounded-t border-b-2 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-inset ${
              isActive
                ? "border-brand-600 font-semibold text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
            href={link.href}
            key={link.href}
          >
            <Icon aria-hidden className={`size-4 ${isActive ? "text-brand-600" : "text-slate-400"}`} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
