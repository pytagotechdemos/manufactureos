import { NextResponse } from "next/server";
import { quality, qualityAccess, qualityErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await qualityAccess("qc.inspect");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await quality.pendingOrders({ limit: Number(params.get("limit") ?? 100), offset: Number(params.get("offset") ?? 0) }));
  } catch (error) { return qualityErrorResponse(error); }
}

export const maxDuration = 60;
