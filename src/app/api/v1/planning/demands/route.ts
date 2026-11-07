import { NextResponse } from "next/server";
import { planning, planningAccess, planningErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await planningAccess("production_demand.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await planning.listDemands({
      ...(params.has("status") ? { status: params.get("status") } : {}),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
      ...(params.has("offset") ? { offset: params.get("offset") } : {}),
    }));
  } catch (error) { return planningErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await planningAccess("production_demand.create");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await planning.createDemand(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return planningErrorResponse(error); }
}
