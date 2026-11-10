import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/authorize";
import { planning, planningAccess, planningErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await planningAccess("production_demand.read");
    if ("error" in access) return access.error;
    await requireAnyPermission(access.user.id, ["production_demand.release", "production_demand.create"]);
    const { id } = await context.params;
    return NextResponse.json({ data: await planning.cancelDemand(access.user.id, id) });
  } catch (error) {
    return planningErrorResponse(error);
  }
}

export const maxDuration = 60;
