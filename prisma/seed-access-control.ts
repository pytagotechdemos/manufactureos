import type { PrismaClient } from "@/generated/prisma/client";
import { permissions } from "@/lib/permissions";

const roleDefinitions = [
  { code: "SUPER_ADMIN", name: "Super Administrator", permissions },
  {
    code: "ENGINEERING",
    name: "Engineering",
    permissions: ["item.read", "item.create", "item.update", "uom.manage", "work_center.manage", "bom.read", "bom.create", "bom.approve"],
  },
  {
    code: "PRODUCTION_PLANNER",
    name: "Production Planner",
    permissions: ["item.read", "bom.read", "production_demand.read", "production_demand.create", "production_demand.release", "mrp.run", "manufacturing_order.read", "manufacturing_order.create", "manufacturing_order.plan", "manufacturing_order.release", "work_order.assign", "reports.read"],
  },
  {
    code: "PURCHASING",
    name: "Purchasing",
    permissions: ["item.read", "purchase_request.read", "purchase_request.create", "purchase_request.approve", "purchase_order.read", "purchase_order.create", "purchase_order.approve", "inventory.receive", "reports.read"],
  },
  {
    code: "WAREHOUSE",
    name: "Warehouse",
    permissions: ["item.read", "inventory.read", "inventory.receive", "inventory.issue", "inventory.reserve", "inventory.transfer", "inventory.adjust"],
  },
  {
    code: "PRODUCTION_OPERATOR",
    name: "Production Operator",
    permissions: ["work_order.read", "work_order.execute", "inventory.issue"],
  },
  { code: "QC_INSPECTOR", name: "QC Inspector", permissions: ["qc.inspect"] },
  { code: "MANAGEMENT", name: "Management", permissions: ["costing.read", "reports.read"] },
] as const;

export async function seedAccessControl(prisma: PrismaClient) {
  await prisma.$transaction(async (transaction) => {
    for (const code of permissions) {
      await transaction.permission.upsert({ where: { code }, update: {}, create: { code } });
    }

    for (const definition of roleDefinitions) {
      const role = await transaction.role.upsert({
        where: { code: definition.code },
        update: { name: definition.name },
        create: { code: definition.code, name: definition.name },
      });

      for (const permissionCode of definition.permissions) {
        const permission = await transaction.permission.findUniqueOrThrow({
          where: { code: permissionCode },
          select: { id: true },
        });

        await transaction.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
  });
}
