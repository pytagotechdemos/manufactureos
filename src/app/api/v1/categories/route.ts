import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "item.read");
    return NextResponse.json({ data: await prisma.itemCategory.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }) });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}

