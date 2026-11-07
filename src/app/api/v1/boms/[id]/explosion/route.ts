import { NextResponse } from "next/server";
import { authenticatedUser, boms, bomErrorResponse } from "../../_shared";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authenticatedUser("bom.read");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    const quantity = new URL(request.url).searchParams.get("quantity") ?? "1";
    return NextResponse.json({ data: await boms.explosion(id, { quantity }) });
  } catch (error) {
    return bomErrorResponse(error);
  }
}
