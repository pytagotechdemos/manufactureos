export const permissions = [
  "item.read",
  "item.create",
  "item.update",
  "uom.manage",
  "bom.read",
  "bom.create",
  "bom.approve",
  "production_demand.read",
  "production_demand.create",
  "production_demand.release",
  "mrp.run",
  "supplier.read",
  "purchase_request.read",
  "purchase_request.create",
  "purchase_request.approve",
  "purchase_order.read",
  "purchase_order.create",
  "purchase_order.approve",
  "inventory.read",
  "inventory.receive",
  "inventory.issue",
  "inventory.reserve",
  "inventory.transfer",
  "inventory.adjust",
  "manufacturing_order.read",
  "manufacturing_order.create",
  "manufacturing_order.plan",
  "manufacturing_order.release",
  "work_order.assign",
  "work_center.manage",
  "work_order.read",
  "work_order.execute",
  "qc.inspect",
  "costing.read",
  "costing.calculate",
  "reports.read",
  "users.manage",
] as const;

export type Permission = (typeof permissions)[number];

export function hasPermission(
  grantedPermissions: readonly string[],
  requiredPermission: Permission,
) {
  return grantedPermissions.includes(requiredPermission);
}
