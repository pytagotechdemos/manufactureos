import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorize";
import { manufacturing, manufacturingAccess, manufacturingErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await manufacturingAccess("manufacturing_order.release");
    if ("error" in access) return access.error;
    await requirePermission(access.user.id, "inventory.reserve");
    const { id } = await context.params;
    return NextResponse.json({ data: await manufacturing.release(access.user.id, id) });
  } catch (error) { return manufacturingErrorResponse(error); }
}

export const maxDuration = 60;
