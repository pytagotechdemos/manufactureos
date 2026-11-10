import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requireAnyPermission, requirePermission } from "@/lib/authorize";
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
  console.error("Warehouse API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requireAnyPermission(user.id, [
      "inventory.read",
      "inventory.receive",
      "purchase_order.read",
      "purchase_order.create",
      "purchase_request.create",
      "manufacturing_order.read",
      "manufacturing_order.create",
      "qc.inspect",
    ]);
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const data = all ? await inventory.listWarehouses() : await inventory.activeWarehouses();
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
    const warehouse = await inventory.createWarehouse(user.id, body);
    return NextResponse.json({ data: warehouse }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 60;
