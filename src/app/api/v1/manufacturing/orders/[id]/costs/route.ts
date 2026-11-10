import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import { requireAnyPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { CostingApplicationError, ManufacturingCostService } from "@/modules/costing/application/manufacturing-cost-service";

const costing = new ManufacturingCostService(prisma);

const costCalculateSchema = z.object({
  type: z.enum(["ESTIMATE", "ACTUAL"]),
});

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof CostingApplicationError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requireAnyPermission(user.id, ["costing.read", "reports.read", "manufacturing_order.read"]);
    const { id } = await context.params;
    return NextResponse.json({ data: await costing.list(id) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requireAnyPermission(user.id, ["costing.calculate", "manufacturing_order.plan"]);
    const { id } = await context.params;
    const parsed = costCalculateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
    if (parsed.data.type === "ESTIMATE") return NextResponse.json({ data: await costing.createEstimate(user.id, id) }, { status: 201 });
    return NextResponse.json({ data: await costing.createActual(user.id, id) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export const maxDuration = 60;
