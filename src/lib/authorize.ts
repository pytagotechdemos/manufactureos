import "server-only";
import { prisma } from "@/lib/prisma";
import { type Permission } from "@/lib/permissions";

export async function userHasPermission(
  userId: string,
  permission: Permission,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      userRoles: {
        select: {
          role: {
            select: {
              permissions: {
                where: { permission: { code: permission } },
                select: { permissionId: true },
              },
            },
          },
        },
      },
    },
  });

  return (
    user?.status === "ACTIVE" &&
    user.userRoles.some((userRole) => userRole.role.permissions.length > 0)
  );
}

export async function userHasAnyPermission(
  userId: string,
  permissions: Permission[],
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      userRoles: {
        select: {
          role: {
            select: {
              permissions: {
                where: { permission: { code: { in: permissions } } },
                select: { permissionId: true },
              },
            },
          },
        },
      },
    },
  });

  return (
    user?.status === "ACTIVE" &&
    user.userRoles.some((userRole) => userRole.role.permissions.length > 0)
  );
}

export async function requirePermission(
  userId: string,
  permission: Permission,
) {
  const allowed = await userHasPermission(userId, permission);

  if (!allowed) {
    throw new Error("FORBIDDEN");
  }
}

export async function requireAnyPermission(
  userId: string,
  permissions: Permission[],
) {
  const allowed = await userHasAnyPermission(userId, permissions);

  if (!allowed) {
    throw new Error("FORBIDDEN");
  }
}
