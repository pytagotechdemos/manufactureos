import { NextResponse } from "next/server";
import { planningAccess, planningErrorResponse, planning } from "../_shared";

export async function GET() {
  try {
    const access = await planningAccess(["production_demand.read", "production_demand.create", "mrp.run"]);
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await planning.masterData() });
  } catch (error) { return planningErrorResponse(error); }
}

export const maxDuration = 60;
