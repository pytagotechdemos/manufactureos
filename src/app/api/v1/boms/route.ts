import { NextResponse } from "next/server";
import { authenticatedUser, boms, bomErrorResponse } from "./_shared";

export async function GET(request: Request) {
  try {
    const access = await authenticatedUser("bom.read");
    if ("error" in access) return access.error;
    const url = new URL(request.url);
    return NextResponse.json(await boms.list(Object.fromEntries(url.searchParams)));
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await authenticatedUser("bom.create");
    if ("error" in access) return access.error;
    const result = await boms.createDraft(access.user.id, await request.json());
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return bomErrorResponse(error);
  }
}

export const maxDuration = 60;
