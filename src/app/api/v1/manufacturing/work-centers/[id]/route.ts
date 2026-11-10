import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { WorkCenterError, WorkCenterService } from "@/modules/master-data/application/work-center-service";

const workCenters = new WorkCenterService(prisma);

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
  if (error instanceof WorkCenterError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : 409 });
  if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "work_center.manage");
    const { id } = await context.params;
    return NextResponse.json({ data: await workCenters.update(user.id, id, await request.json()) });
  } catch (error) { return errorResponse(error); }
}

export const maxDuration = 60;
