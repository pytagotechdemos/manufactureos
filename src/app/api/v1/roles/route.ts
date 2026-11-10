import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { UserAdminService } from "@/modules/administration/application/user-admin-service";

const administration = new UserAdminService(prisma);

export async function GET() {
  try {
    const access = await getCurrentUser();
    if (!access) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(access.id, "users.manage");
    return NextResponse.json({ data: await administration.listRoles() });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    console.error("Roles API error", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}


export const maxDuration = 60;
