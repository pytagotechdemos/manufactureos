import { NextResponse } from "next/server";
import { authenticatedUserAny, boms, bomErrorResponse } from "../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUserAny(["bom.approve", "bom.create"]);
    if ("error" in access) return access.error;
    const { id } = await context.params;
    let reason: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.reason === "string") {
        reason = body.reason.trim();
      }
    } catch {
      // Body is optional
    }
    return NextResponse.json({ data: await boms.rejectToDraft(access.user.id, id, reason) });
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export const maxDuration = 60;
