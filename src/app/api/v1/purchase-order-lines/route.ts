import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ProcurementService } from "@/modules/procurement/application/procurement-service";

const procurement = new ProcurementService(prisma);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "purchase_order.read");
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await procurement.purchaseOrderLines({ limit: params.get("limit") ?? undefined, offset: params.get("offset") ?? undefined }));
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    console.error("Purchase order lines API error", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}


export const maxDuration = 60;
