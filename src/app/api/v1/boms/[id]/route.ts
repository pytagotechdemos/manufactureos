import { NextResponse } from "next/server";
import { authenticatedUser, boms, bomErrorResponse } from "../_shared";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUser("bom.read");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await boms.get(id) });
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUser("bom.create");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    return NextResponse.json({ data: await boms.updateDraft(access.user.id, id, await request.json()) });
  } catch (error) {
    return bomErrorResponse(error);
  }
}
