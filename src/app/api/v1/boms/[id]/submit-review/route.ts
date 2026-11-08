import { NextResponse } from "next/server";
import { authenticatedUser, boms, bomErrorResponse } from "../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUser("bom.create");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await boms.submitForReview(access.user.id, id) });
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export const maxDuration = 60;
