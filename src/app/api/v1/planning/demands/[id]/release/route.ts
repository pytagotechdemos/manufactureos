import { NextResponse } from "next/server";
import { planning, planningAccess, planningErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await planningAccess("production_demand.release");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await planning.releaseDemand(access.user.id, id) });
  } catch (error) { return planningErrorResponse(error); }
}
