import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const navigation = [
  ["Overview", "/overview"],
  ["Items", "/items"],
  ["Engineering", "/engineering"],
  ["Planning", "/planning"],
  ["Procurement", "/procurement"],
  ["Inventory", "/inventory"],
  ["Manufacturing", "/manufacturing"],
  ["Quality", "/quality"],
  ["Costing & Reports", "/reports"],
  ["Administration", "/administration"],
] as const;

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const roleLinks = await prisma.userRole.findMany({
    where: { userId: user.id },
    select: { role: { select: { name: true } } },
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-5 md:flex md:flex-col">
          <Link className="text-lg font-bold tracking-tight text-slate-950" href="/overview">ManufactureOS</Link>
          <p className="mt-1 text-xs text-slate-500">Manufacturing operations</p>
          <nav aria-label="Main navigation" className="mt-9 space-y-1">
            {navigation.map(([label, href]) => (
              <Link className="block rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950" href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-200 pt-4">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-2 text-xs text-slate-500">{roleLinks.map(({ role }) => role.name).join(", ") || "No roles assigned"}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
            <span className="font-semibold text-slate-900 md:hidden">ManufactureOS</span>
            <span className="ml-auto text-sm text-slate-500">Plant operations</span>
          </header>
          <main className="mx-auto w-full max-w-7xl p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
