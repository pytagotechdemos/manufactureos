import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { PlanningError, PlanningService } from "@/modules/planning/application/planning-service";

export const planning = new PlanningService(prisma);

export async function planningAccess(permission: "production_demand.read" | "production_demand.create" | "production_demand.release" | "mrp.run") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

export function planningErrorResponse(error: unknown) {
  if (error instanceof PlanningError) {
    const status = error.code === "INVALID_INPUT" || error.code === "MRP_ERROR" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  console.error("Planning API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}
