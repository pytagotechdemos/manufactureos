import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission, requireAnyPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { BomApplicationError, BomService } from "@/modules/engineering/application/bom-service";

export const boms = new BomService(prisma);

export function bomErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof BomApplicationError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATE" || error.code === "CONFLICT" ? 409 : 422;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }
  console.error("BOM API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function authenticatedUser(permission: "bom.read" | "bom.create" | "bom.approve") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

export async function authenticatedUserAny(permissions: ("bom.read" | "bom.create" | "bom.approve")[]) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requireAnyPermission(user.id, permissions);
  return { user };
}
