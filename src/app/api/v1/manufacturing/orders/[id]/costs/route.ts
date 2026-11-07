import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { CostingApplicationError, ManufacturingCostService } from "@/modules/costing/application/manufacturing-cost-service";

const costing = new ManufacturingCostService(prisma);

async function access(permission: "costing.read" | "costing.calculate") {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }) };
  await requirePermission(user.id, permission);
  return { user };
}

function errorResponse(error: unknown) {
  if (error instanceof CostingApplicationError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const allowed = await access("costing.read");
    if ("error" in allowed) return allowed.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await costing.list(id) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const allowed = await access("costing.calculate");
    if ("error" in allowed) return allowed.error;
    const { id } = await context.params;
    const body = await request.json() as { type?: string };
    if (body.type === "ESTIMATE") return NextResponse.json({ data: await costing.createEstimate(allowed.user.id, id) }, { status: 201 });
    if (body.type === "ACTUAL") return NextResponse.json({ data: await costing.createActual(allowed.user.id, id) }, { status: 201 });
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "type must be ESTIMATE or ACTUAL" } }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
