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
    items: [{ label: "Overview", href: "/overview", icon: LayoutDashboard }],
  },
  {
    label: "Engineering & Master Data",
    items: [
      { label: "Item Master", href: "/items", icon: Package },
      { label: "Bill of Materials (BOM)", href: "/engineering", match: ["/engineering", "/boms"], icon: GitBranch },
    ],
  },
  {
    label: "Supply Chain & Planning",
    items: [
      { label: "Planning & MRP", href: "/planning", icon: CalendarRange },
      { label: "Procurement (PO & PR)", href: "/procurement", icon: ShoppingCart },
      { label: "Inventory & Stock", href: "/inventory", icon: Warehouse },
    ],
  },
  {
    label: "Manufacturing & QC",
    items: [
      { label: "Manufacturing Orders", href: "/manufacturing", match: ["/manufacturing"], icon: Factory },
      { label: "Quality Control (QC)", href: "/quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "Finance & Admin",
    items: [
      { label: "Costing & Reports", href: "/reports", icon: BarChart3 },
      { label: "Administration", href: "/administration", icon: Settings },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);

export function isActivePath(pathname: string, item: NavItem): boolean {
  const candidates = item.match ?? [item.href];
  return candidates.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
}
