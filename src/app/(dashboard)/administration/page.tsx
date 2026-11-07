import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-session";
import { userHasPermission } from "@/lib/authorize";
import { formatDate, formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Administration",
};

export default async function AdministrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = await userHasPermission(user.id, "users.manage");
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Access" title="Administration" description="People, roles and permissions." />
        <Card>
          <EmptyState
            icon={<ShieldCheck aria-hidden className="size-5" />}
            title="You do not have access to administration"
            description="This area requires the users.manage permission. Ask an administrator to grant you a role that includes it."
          />
        </Card>
      </div>
    );
  }

  const [users, roles, permissionCount] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        userRoles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.permission.count(),
  ]);

  const activeUsers = users.filter((entry) => entry.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Access control"
        title="Administration"
        description="Provision people and inspect which permissions each role carries."
        actions={<CreateUserForm />}
      />

      <StatGrid>
        <Stat label="People" hint={`${activeUsers} active`} value={users.length} />
        <Stat label="Roles" hint="Assigned through user roles" value={roles.length} />
        <Stat label="Permissions" hint="Checked server-side on every mutation" value={permissionCount} />
        <Stat label="Your access" hint="Roles assigned to you" value={users.find((entry) => entry.email === user.email)?.userRoles.length ?? 0} tone="info" />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader description="Accounts are created here; public sign-up stays disabled." title="People" />
          <CardBody className="p-0">
            {users.length === 0 ? (
              <EmptyState icon={<Users aria-hidden className="size-5" />} title="No accounts yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Roles</Th>
                    <Th>Status</Th>
                    <Th align="right">Added</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {users.map((entry) => (
                    <Tr key={entry.id}>
                      <Td className="font-medium text-slate-900">{entry.name}</Td>
                      <Td className="text-slate-600">{entry.email}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {entry.userRoles.length === 0 ? (
                            <span className="text-slate-400">No roles</span>
                          ) : (
                            entry.userRoles.map(({ role }) => (
                              <Badge key={role.code} tone="neutral">
                                {role.name}
                              </Badge>
                            ))
                          )}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={entry.status} />
                      </Td>
                      <Td align="right" className="tnum text-slate-500">
                        <span title={formatDate(entry.createdAt)}>{formatRelative(entry.createdAt)}</span>
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader description="Every protected screen checks one of these codes." title="Roles & permissions" />
          <CardBody className="scroll-area max-h-[520px] space-y-4 overflow-y-auto">
            {roles.map((role) => (
              <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0" key={role.id}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-slate-900">{role.name}</p>
                  <Badge tone="info">{role.permissions.length}</Badge>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{role.code}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {role.permissions.map(({ permission }) => (
                    <span
                      className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                      key={permission.code}
                    >
                      {permission.code}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
