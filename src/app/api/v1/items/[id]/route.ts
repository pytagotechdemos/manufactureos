import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ItemService, MasterDataError } from "@/modules/master-data/application/item-service";

const items = new ItemService(prisma);
const statusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    await requirePermission(user.id, "item.update");
    const body = statusSchema.safeParse(await request.json());
    if (!body.success) throw new MasterDataError("INVALID_INPUT", body.error.message);
    const { id } = await context.params;
    return NextResponse.json({ data: await items.setStatus(user.id, id, body.data.status) });
  } catch (error) {
    if (error instanceof MasterDataError) {
      const status = error.code === "INVALID_INPUT" ? 400 : error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Permission denied" } }, { status: 403 });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, { status: 500 });
  }
}

export const maxDuration = 60;
