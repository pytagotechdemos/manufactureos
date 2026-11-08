import { NextResponse } from "next/server";
import { quality, qualityAccess, qualityErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await qualityAccess("qc.inspect");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await quality.postInspection(access.user.id, id) });
  } catch (error) { return qualityErrorResponse(error); }
}

export const maxDuration = 60;
