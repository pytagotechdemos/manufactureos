import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/authorize";
import { manufacturing, manufacturingAccess, manufacturingErrorResponse } from "../../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await manufacturingAccess("manufacturing_order.read");
    if ("error" in access) return access.error;
    await requireAnyPermission(access.user.id, ["manufacturing_order.release", "manufacturing_order.plan", "manufacturing_order.create"]);
    const { id } = await context.params;
    let reason: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }
    return NextResponse.json({ data: await manufacturing.cancel(access.user.id, id, reason) });
  } catch (error) {
    return manufacturingErrorResponse(error);
  }
}

export const maxDuration = 60;
