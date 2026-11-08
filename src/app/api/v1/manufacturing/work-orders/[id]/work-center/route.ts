import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorize";
import { workOrderAccess, workOrderErrorResponse, workOrders } from "@/app/api/v1/manufacturing/work-orders/_shared";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await workOrderAccess("work_order.read");
    if ("error" in access) return access.error;
    await requirePermission(access.user.id, "work_order.assign");
    const { id } = await context.params;
    return NextResponse.json({ data: await workOrders.assignWorkCenter(access.user.id, id, await request.json()) });
  } catch (error) { return workOrderErrorResponse(error); }
}

export const maxDuration = 60;
