import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { MasterDataError, ItemService } from "@/modules/master-data/application/item-service";

const items = new ItemService(prisma);

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof MasterDataError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }
  console.error("UOM API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "item.read");
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const data = all ? await items.listUoms() : await items.activeUoms();
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "users.manage");
    const body = await request.json();
    const uom = await items.createUom(user.id, body);
    return NextResponse.json({ data: uom }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 60;
