import { NextResponse } from "next/server";
import { quality, qualityAccess, qualityErrorResponse } from "../_shared";

export async function GET() {
  try {
    const access = await qualityAccess("qc.inspect");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await quality.inspections() });
  } catch (error) { return qualityErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const access = await qualityAccess("qc.inspect");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await quality.createInspection(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) { return qualityErrorResponse(error); }
}
