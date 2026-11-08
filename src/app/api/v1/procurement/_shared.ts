import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ProcurementError, ProcurementService } from "@/modules/procurement/application/procurement-service";

export const procurement = new ProcurementService(prisma);

export async function procurementAccess(permission: "purchase_request.read" | "purchase_request.create" | "purchase_request.approve" | "purchase_order.read" | "purchase_order.create" | "purchase_order.approve" | "inventory.receive") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

export function procurementErrorResponse(error: unknown) {
  if (error instanceof ProcurementError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "OVER_RECEIPT" ? 422 : error.code === "INVALID_STATE" ? 409 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  console.error("Procurement API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}
