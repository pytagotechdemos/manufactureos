import { NextResponse } from "next/server";
import { workOrderAccess, workOrders, workOrderErrorResponse } from "../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await workOrderAccess("work_order.read");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await workOrders.get(id) });
  } catch (error) { return workOrderErrorResponse(error); }
}

export const maxDuration = 60;
