import { NextResponse } from "next/server";
import { manufacturing, manufacturingAccess, manufacturingErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await manufacturingAccess("manufacturing_order.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await manufacturing.list({
      ...(params.has("status") ? { status: params.get("status") } : {}),
      ...(params.has("limit") ? { limit: params.get("limit") } : {}),
      ...(params.has("offset") ? { offset: params.get("offset") } : {}),
    }));
  } catch (error) { return manufacturingErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await manufacturingAccess("manufacturing_order.create");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await manufacturing.createFromRecommendation(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return manufacturingErrorResponse(error); }
}

export const maxDuration = 60;
