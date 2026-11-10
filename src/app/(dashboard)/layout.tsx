import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";

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
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        roleNames: roleLinks.map(({ role }) => role.name),
      }}
    >
      {children}
    </AppShell>
  );
}
