import { NextResponse } from "next/server";
import { manufacturing, manufacturingAccess, manufacturingErrorResponse } from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await manufacturingAccess("manufacturing_order.read");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await manufacturing.get(id) });
  } catch (error) { return manufacturingErrorResponse(error); }
}

export const maxDuration = 60;
