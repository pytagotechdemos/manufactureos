import { NextResponse } from "next/server";
import { procurement, procurementAccess, procurementErrorResponse } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await procurementAccess("purchase_order.create");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await procurement.createGoodsReceipt(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return procurementErrorResponse(error); }
}
