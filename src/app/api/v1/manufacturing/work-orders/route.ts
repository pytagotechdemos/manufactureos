import { NextResponse } from "next/server";
import { workOrderAccess, workOrders, workOrderErrorResponse } from "./_shared";

export async function GET(request: Request) {
  try {
    const access = await workOrderAccess("work_order.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    const data = await workOrders.list({
      ...(params.has("status") ? { status: params.get("status") } : {}),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
    });
    return NextResponse.json({ data });
  } catch (error) { return workOrderErrorResponse(error); }
}

export const maxDuration = 60;
