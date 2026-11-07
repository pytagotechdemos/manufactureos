import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { InventoryError } from "@/modules/inventory/application/inventory-service";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ManufacturingError, ManufacturingService } from "@/modules/manufacturing/application/manufacturing-service";

export const manufacturing = new ManufacturingService(prisma);

export async function manufacturingAccess(permission: "manufacturing_order.read" | "manufacturing_order.create" | "manufacturing_order.plan" | "manufacturing_order.release") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

export function manufacturingErrorResponse(error: unknown) {
  if (error instanceof InventoryError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "INSUFFICIENT_STOCK" ? 422 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof ManufacturingError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "MISSING_BOM" ? 422 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}
