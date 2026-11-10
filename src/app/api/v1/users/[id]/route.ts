import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { UserAdminError, UserAdminService } from "@/modules/administration/application/user-admin-service";

const users = new UserAdminService(prisma);
const statusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getCurrentUser();
    if (!access) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(access.id, "users.manage");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 });
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.message } }, { status: 400 });
    }

    const { id } = await context.params;
    const updated = await users.setStatus(access.id, id, parsed.data.status);
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof UserAdminError) {
      const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
    console.error("User PATCH API error", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}

export const maxDuration = 60;
