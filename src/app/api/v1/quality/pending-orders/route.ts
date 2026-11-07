import { NextResponse } from "next/server";
import { quality, qualityAccess, qualityErrorResponse } from "../_shared";

export async function GET() {
  try {
    const access = await qualityAccess("qc.inspect");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await quality.pendingOrders() });
  } catch (error) { return qualityErrorResponse(error); }
}
