import { NextResponse } from "next/server";
import { workOrderAccess, workOrders, workOrderErrorResponse } from "./_shared";

export async function GET(request: Request) {
  try {
    const access = await workOrderAccess("work_order.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await workOrders.list({
      ...(params.has("status") ? { status: params.get("status") } : {}),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
    }));
  } catch (error) { return workOrderErrorResponse(error); }
}
