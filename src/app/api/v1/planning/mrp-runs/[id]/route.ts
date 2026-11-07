import { NextResponse } from "next/server";
import { planning, planningAccess, planningErrorResponse } from "../../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await planningAccess("mrp.run");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await planning.getMrpRun(id) });
  } catch (error) { return planningErrorResponse(error); }
}
