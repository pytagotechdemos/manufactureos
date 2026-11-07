import { NextResponse } from "next/server";
import { manufacturing, manufacturingErrorResponse } from "@/app/api/v1/manufacturing/_shared";
import { requirePermission } from "@/lib/authorize";
import { workOrderAccess } from "@/app/api/v1/manufacturing/work-orders/_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string; materialId: string }> }) {
  try {
    const access = await workOrderAccess("work_order.execute");
    if ("error" in access) return access.error;
    await requirePermission(access.user.id, "inventory.issue");
    const { id, materialId } = await context.params;
    return NextResponse.json({ data: await manufacturing.returnMaterial(access.user.id, id, materialId, await request.json()) });
  } catch (error) { return manufacturingErrorResponse(error); }
}
