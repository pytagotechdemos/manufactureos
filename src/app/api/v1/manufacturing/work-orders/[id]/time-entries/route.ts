import { NextResponse } from "next/server";
import { workOrderAccess, workOrders, workOrderErrorResponse } from "../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await workOrderAccess("work_order.execute");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await workOrders.recordTime(access.user.id, id, await request.json()) }, { status: 201 });
  } catch (error) { return workOrderErrorResponse(error); }
}
