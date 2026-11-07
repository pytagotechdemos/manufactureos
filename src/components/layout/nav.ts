import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  Factory,
  GitBranch,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  /** Path prefixes that should light this item up (defaults to `href`). */
  match?: string[];
  icon: LucideIcon;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    items: [{ label: "Ringkasan", href: "/overview", icon: LayoutDashboard }],
  },
  {
    label: "Teknik",
    items: [
      { label: "Data Barang", href: "/items", icon: Package },
      { label: "Bill of Material", href: "/engineering", match: ["/engineering", "/boms"], icon: GitBranch },
    ],
  },
  {
    label: "Rantai Pasok",
    items: [
      { label: "Perencanaan & MRP", href: "/planning", icon: CalendarRange },
      { label: "Pembelian", href: "/procurement", icon: ShoppingCart },
      { label: "Inventori", href: "/inventory", icon: Warehouse },
    ],
  },
  {
    label: "Operasi",
    items: [
      { label: "Produksi", href: "/manufacturing", match: ["/manufacturing"], icon: Factory },
      { label: "Kualitas", href: "/quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "Wawasan",
    items: [
      { label: "Biaya & Laporan", href: "/reports", icon: BarChart3 },
      { label: "Administrasi", href: "/administration", icon: Settings },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);

export function isActivePath(pathname: string, item: NavItem): boolean {
  const candidates = item.match ?? [item.href];
  return candidates.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
}
