import { NextResponse } from "next/server";
import { procurement, procurementAccess, procurementErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await procurementAccess("purchase_order.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await procurement.listPurchaseOrders({
      ...(params.has("status") ? { status: params.get("status") } : {}),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
      ...(params.has("offset") ? { offset: params.get("offset") } : {}),
    }));
  } catch (error) { return procurementErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await procurementAccess("purchase_order.create");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await procurement.createPurchaseOrder(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return procurementErrorResponse(error); }
}
