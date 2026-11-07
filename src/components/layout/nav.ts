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
    label: "Engineering",
    items: [
      { label: "Item Master", href: "/items", icon: Package },
      { label: "Bills of Material", href: "/engineering", match: ["/engineering", "/boms"], icon: GitBranch },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      { label: "Planning & MRP", href: "/planning", icon: CalendarRange },
      { label: "Procurement", href: "/procurement", icon: ShoppingCart },
      { label: "Inventory", href: "/inventory", icon: Warehouse },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Manufacturing", href: "/manufacturing", match: ["/manufacturing"], icon: Factory },
      { label: "Quality Control", href: "/quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "Insight",
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
