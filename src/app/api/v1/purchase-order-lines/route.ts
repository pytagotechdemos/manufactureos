import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "purchase_order.read");
    return NextResponse.json({ data: await prisma.purchaseOrderLine.findMany({ orderBy: [{ orderId: "asc" }, { sequence: "asc" }], take: 200, include: { item: { select: { id: true, sku: true, name: true } }, order: { include: { supplier: { select: { code: true } } } } } }) });
  } catch (error) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}
