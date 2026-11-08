import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const access = await getCurrentUser();
    if (!access) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(access.id, "users.manage");
    return NextResponse.json({ data: await prisma.role.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, permissions: { select: { permission: { select: { code: true } } } } } }) });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}


export const maxDuration = 60;
