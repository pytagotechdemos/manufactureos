import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";
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
  /** At least one of these permissions is required to see the menu item. */
  permissions?: Permission[];
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
      { label: "Item Master", href: "/items", permissions: ["item.read"], icon: Package },
      { label: "Bill of Materials (BOM)", href: "/engineering", permissions: ["bom.read"], match: ["/engineering", "/boms"], icon: GitBranch },
    ],
  },
  {
    label: "Supply Chain & Planning",
    items: [
      { label: "Planning & MRP", href: "/planning", permissions: ["production_demand.read", "mrp.run"], icon: CalendarRange },
      { label: "Procurement (PO & PR)", href: "/procurement", permissions: ["purchase_order.read", "purchase_request.read"], icon: ShoppingCart },
      { label: "Inventory & Stock", href: "/inventory", permissions: ["inventory.read"], icon: Warehouse },
    ],
  },
  {
    label: "Manufacturing & QC",
    items: [
      { label: "Manufacturing Orders", href: "/manufacturing", permissions: ["manufacturing_order.read", "work_order.read"], match: ["/manufacturing"], icon: Factory },
      { label: "Quality Control (QC)", href: "/quality", permissions: ["qc.inspect"], icon: ClipboardCheck },
    ],
  },
  {
    label: "Finance & Admin",
    items: [
      { label: "Costing & Reports", href: "/reports", permissions: ["reports.read", "costing.read"], icon: BarChart3 },
      { label: "Administration", href: "/administration", permissions: ["users.manage"], icon: Settings },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);

export function isActivePath(pathname: string, item: NavItem): boolean {
  const candidates = item.match ?? [item.href];
  return candidates.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
}
