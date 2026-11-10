import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requireAnyPermission, requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ProcurementError, ProcurementService } from "@/modules/procurement/application/procurement-service";

const procurement = new ProcurementService(prisma);

async function requireSupplierReadAccess() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requireAnyPermission(user.id, [
    "supplier.read",
    "purchase_order.read",
    "purchase_order.create",
    "purchase_request.create",
    "purchase_request.read",
    "inventory.receive",
  ]);
  return { user };
}

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof ProcurementError) {
    const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : error.code === "OVER_RECEIPT" ? 422 : 409;
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  console.error("Supplier API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const access = await requireSupplierReadAccess();
    if ("error" in access) return access.error;
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const data = all ? await procurement.listSuppliers() : await procurement.activeSuppliers();
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
    const supplier = await procurement.createSupplier(user.id, body);
    return NextResponse.json({ data: supplier }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 60;
