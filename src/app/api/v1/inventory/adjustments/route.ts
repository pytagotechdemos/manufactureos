import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await inventoryAccess("inventory.adjust");
    if ("error" in access) return access.error;
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Request body must be valid JSON" } }, { status: 400 }); }
    return NextResponse.json({ data: await inventory.adjust(access.user.id, body) }, { status: 201 });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export const maxDuration = 60;
