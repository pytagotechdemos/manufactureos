import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { userHasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ItemService, MasterDataError } from "@/modules/master-data/application/item-service";

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
  console.error("Category PATCH error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    const canUpdate = (await userHasPermission(user.id, "item.update")) || (await userHasPermission(user.id, "users.manage"));
    if (!canUpdate) throw new Error("FORBIDDEN");
    const { id } = await params;
    const body = await request.json();
    const category = await items.updateCategory(user.id, id, body);
    return NextResponse.json({ data: category });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 60;
