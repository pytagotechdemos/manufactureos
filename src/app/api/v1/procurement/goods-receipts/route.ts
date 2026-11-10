import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { procurement, procurementErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await getCurrentUser();
    if (!access) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    await requirePermission(access.id, "inventory.read");
    const params = new URL(request.url).searchParams;
    const data = await procurement.listGoodsReceipts({ limit: params.get("limit") ?? undefined, offset: params.get("offset") ?? undefined });
    return NextResponse.json(data);
  } catch (error) {
    return procurementErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getCurrentUser();
    if (!access) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    await requirePermission(access.id, "inventory.receive");
    const body = await request.json();
    const receipt = await procurement.createGoodsReceipt(access.id, body);
    return NextResponse.json({ data: receipt }, { status: 201 });
  } catch (error) {
    return procurementErrorResponse(error);
  }
}


export const maxDuration = 60;
