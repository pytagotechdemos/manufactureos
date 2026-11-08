import { NextResponse } from "next/server";
import { procurement, procurementAccess, procurementErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await procurementAccess("purchase_order.approve");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await procurement.approvePurchaseOrder(access.user.id, id) });
  } catch (error) { return procurementErrorResponse(error); }
}

export const maxDuration = 60;
