/**
 * Verifies that access-control seed data is present and that the administrator
 * account actually holds every permission the application checks for.
 *
 * Usage: ADMIN_EMAIL=admin@example.com pnpm exec tsx scripts/check-rbac.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { permissions } from "../src/lib/permissions";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("ADMIN_EMAIL must be set");
  }

  const [permissionCount, roleCount, rolePermissionCount, admin] = await Promise.all([
    prisma.permission.count(),
    prisma.role.count(),
    prisma.rolePermission.count(),
    prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        role: true,
        userRoles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  console.log(`permissions=${permissionCount} roles=${roleCount} rolePermissions=${rolePermissionCount}`);

  if (permissionCount < permissions.length) {
    throw new Error(`Expected at least ${permissions.length} permissions, found ${permissionCount}`);
  }
  if (!admin) {
    throw new Error(`Administrator ${email} not found`);
  }
  if (admin.status !== "ACTIVE") {
    throw new Error(`Administrator ${email} is ${admin.status}`);
  }

  const granted = new Set(
    admin.userRoles.flatMap((userRole) =>
      userRole.role.permissions.map((entry) => entry.permission.code),
    ),
  );
  const missing = permissions.filter((code) => !granted.has(code));

  console.log(`admin roles: ${admin.userRoles.map((userRole) => userRole.role.code).join(", ") || "(none)"}`);
  console.log(`granted ${granted.size}/${permissions.length} permissions`);

  if (missing.length > 0) {
    throw new Error(`Administrator is missing permissions: ${missing.join(", ")}`);
  }

  console.log("✅ RBAC verification passed");
}

main()
  .catch((error) => {
    console.error("❌ RBAC verification failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
