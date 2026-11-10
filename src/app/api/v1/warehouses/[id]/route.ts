import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { InventoryError, InventoryService } from "@/modules/inventory/application/inventory-service";

const inventory = new InventoryService(prisma);

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof InventoryError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "INSUFFICIENT_STOCK" ? 422 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  }
  console.error("Warehouse PATCH error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "users.manage");
    const { id } = await params;
    const body = await request.json();
    const schema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 422 });
    const warehouse = await inventory.setWarehouseStatus(user.id, id, parsed.data.status);
    return NextResponse.json({ data: warehouse });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 60;
