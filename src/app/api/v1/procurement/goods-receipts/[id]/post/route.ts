import { NextResponse } from "next/server";
import { procurement, procurementAccess, procurementErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await procurementAccess("inventory.receive");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await procurement.postGoodsReceipt(access.user.id, id) });
  } catch (error) { return procurementErrorResponse(error); }
}
