import { NextResponse } from "next/server";
import { quality, qualityAccess, qualityErrorResponse } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await qualityAccess("inventory.receive");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await quality.postProductionReceipt(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return qualityErrorResponse(error); }
}

export const maxDuration = 60;
