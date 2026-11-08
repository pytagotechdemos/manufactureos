import { NextResponse } from "next/server";
import { manufacturing, manufacturingAccess, manufacturingErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await manufacturingAccess("manufacturing_order.plan");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await manufacturing.plan(access.user.id, id) });
  } catch (error) { return manufacturingErrorResponse(error); }
}

export const maxDuration = 60;
