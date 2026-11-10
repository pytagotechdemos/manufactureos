import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/authorize";
import { procurement, procurementAccess, procurementErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await procurementAccess("purchase_order.read");
    if ("error" in access) return access.error;
    await requireAnyPermission(access.user.id, ["purchase_order.approve", "purchase_order.create"]);
    const { id } = await context.params;
    return NextResponse.json({ data: await procurement.cancelPurchaseOrder(access.user.id, id) });
  } catch (error) {
    return procurementErrorResponse(error);
  }
}

export const maxDuration = 60;
