import { NextResponse } from "next/server";
import { authenticatedUser, boms, bomErrorResponse } from "../../_shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUser("bom.create");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    const body = await request.json();
    const result = await boms.cloneAsDraft(access.user.id, id, body);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export const maxDuration = 60;
