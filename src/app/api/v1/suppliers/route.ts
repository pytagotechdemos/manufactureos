import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

async function requireAdminLikeUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, "users.manage");
  return { user };
}

export async function GET() {
  try {
    const access = await requireAdminLikeUser();
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await prisma.supplier.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }) });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}


export const maxDuration = 60;
