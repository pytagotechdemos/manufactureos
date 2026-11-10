import { NextResponse } from "next/server";
import { planning, planningAccess, planningErrorResponse } from "../_shared";

export const maxDuration = 60;

export async function GET() {
  try {
    const access = await planningAccess([
      "mrp.run",
      "production_demand.read",
      "manufacturing_order.create",
      "manufacturing_order.read",
    ]);
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await planning.listMrpRuns() });
  } catch (error) { return planningErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await planningAccess("mrp.run");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await planning.runMrp(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return planningErrorResponse(error); }
}
