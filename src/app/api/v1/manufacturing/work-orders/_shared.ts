import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { InventoryError } from "@/modules/inventory/application/inventory-service";
import { WorkOrderError, WorkOrderService } from "@/modules/manufacturing/application/work-order-service";

export const workOrders = new WorkOrderService(prisma);

export async function workOrderAccess(permission: "work_order.read" | "work_order.execute") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

export function workOrderErrorResponse(error: unknown) {
  if (error instanceof InventoryError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "INSUFFICIENT_STOCK" ? 422 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof WorkOrderError) {
    const status = error.code === "INVALID_INPUT" || error.code === "INVALID_OUTPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "DEPENDENCY" ? 409 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  console.error("Work order API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}
